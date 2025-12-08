import type { WebSocket } from '@fastify/websocket';
import type { FastifyBaseLogger } from 'fastify';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import {
  type ClientMessage,
  type ServerMessage,
  type TokenMessage,
  type CompleteMessage,
  ExtendedClientMessageSchema,
  type ExtendedClientMessage,
} from './schemas.js';
import type { EventLogger } from '../core/eventlog.js';

interface ParticipantConnection {
  participantId: string;
  sessionId: string;
  ws: WebSocket;
  lastSeq: Map<number, number>; // round -> last seq
  lastSeen: Date;
}

export class WebSocketHub {
  private connections = new Map<string, ParticipantConnection>();
  private telaoConnections = new Map<string, WebSocket>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private tokenBuffer = new Map<string, Map<number, string[]>>(); // participantId -> round -> tokens
  private firstTokenTime = new Map<string, Map<number, Date>>(); // participantId -> round -> first token timestamp
  private generationStartTime = new Map<string, Map<number, Date>>(); // participantId -> round -> start timestamp

  constructor(
    private prisma: PrismaClient,
    private logger: FastifyBaseLogger,
    private eventLogger?: EventLogger
  ) {
    this.startHeartbeat();
  }

  async handleConnection(ws: WebSocket, sessionId?: string) {
    const connId = `conn-${Date.now()}-${Math.random()}`;

    ws.on('message', async (data) => {
      try {
        const raw = JSON.parse(data.toString());
        // Accept both participant messages and telao registrations
        const message = ExtendedClientMessageSchema.parse(raw) as ExtendedClientMessage;

        await this.handleMessage(connId, ws, message);
      } catch (error) {
        this.logger.error({ error, connId }, 'Failed to parse message');
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      this.handleDisconnection(connId);
    });

    ws.on('error', (error) => {
      this.logger.error({ error, connId }, 'WebSocket error');
    });
  }

  private async handleMessage(connId: string, ws: WebSocket, message: ExtendedClientMessage) {
  // message may be ExtendedClientMessage at runtime; narrow by type
  switch (message.type) {
      case 'register':
        await this.handleRegister(connId, ws, message);
        break;
      case 'token':
        await this.handleToken(message);
        break;
      case 'complete':
        await this.handleComplete(message);
        break;
      case 'telao_register':
        await this.handleTelaoRegister(connId, ws, message as any);
        break;
      case 'error':
        this.logger.error({ message }, 'Client error');
        break;
    }
  }

  private async handleTelaoRegister(connId: string, ws: WebSocket, message: any) {
    // Register this websocket as a telao connection
    this.telaoConnections.set(connId, ws);

    this.logger.info({ connId, view: message.view }, 'Telao registered');

    try {
      ws.send(JSON.stringify({ type: 'registered_telao', view: message.view || 'arena' }));
    } catch (error) {
      this.logger.error({ error }, 'Failed to ack telao register');
    }
  }

  private async handleRegister(
    connId: string,
    ws: WebSocket,
    message: ClientMessage & { type: 'register' }
  ) {
    try {
      // Find active session
      const session = await this.prisma.session.findFirst({
        where: { status: 'active' },
        orderBy: { createdAt: 'desc' },
      });

      if (!session) {
        ws.send(JSON.stringify({ type: 'error', message: 'No active session' }));
        return;
      }

      // Verify PIN
      const pinValid = await bcrypt.compare(message.pin, session.pinHash);
      if (!pinValid) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid PIN.' }));
        return;
      }

      // Create or update participant
      // IMPORTANT: Always update sessionId to move participant to current session
      const participantRecord = await this.prisma.participant.upsert({
        where: { id: message.participant_id },
        create: {
          id: message.participant_id,
          sessionId: session.id,
          nickname: message.nickname,
          runner: message.runner,
          model: message.model,
          lastSeen: new Date(),
          connected: true,
        },
        update: {
          sessionId: session.id,  // Move to current session
          nickname: message.nickname,
          runner: message.runner,
          model: message.model,
          lastSeen: new Date(),
          connected: true,
        },
      });

      // Store connection
      this.connections.set(connId, {
        participantId: message.participant_id,
        sessionId: session.id,
        ws,
        lastSeq: new Map(),
        lastSeen: new Date(),
      });

      this.logger.info(
        { participantId: message.participant_id, sessionId: session.id },
        'Participant registered'
      );

      // Log event for research
      await this.eventLogger?.log({
        sessionId: session.id,
        eventType: 'participant_registered',
        actorType: 'participant',
        actorId: message.participant_id,
        targetType: 'participant',
        targetId: message.participant_id,
        metadata: {
          nickname: message.nickname,
          runner: message.runner,
          model: message.model,
        },
      });

      // Notify telao about the new/updated participant so UI can show immediately
      try {
        this.broadcastToTelao({
          type: 'participant_registered',
          participant: {
            id: participantRecord.id,
            nickname: participantRecord.nickname,
            runner: participantRecord.runner,
            model: participantRecord.model,
            lastSeen: participantRecord.lastSeen,
            connected: true,
          },
        });
      } catch (err) {
        this.logger.debug({ err }, 'Failed to broadcast participant_registered');
      }

      ws.send(JSON.stringify({ type: 'registered', session_id: session.id }));
    } catch (error) {
      this.logger.error({ error }, 'Registration failed');
      ws.send(JSON.stringify({ type: 'error', message: 'Registration failed' }));
    }
  }

  private async handleToken(message: TokenMessage) {
    const participantKey = message.participant_id;
    const now = new Date();

    if (!this.tokenBuffer.has(participantKey)) {
      this.tokenBuffer.set(participantKey, new Map());
    }

    const roundBuffer = this.tokenBuffer.get(participantKey)!;
    if (!roundBuffer.has(message.round)) {
      roundBuffer.set(message.round, []);
    }

    const tokens = roundBuffer.get(message.round)!;

    // Validate sequence
    if (message.seq !== tokens.length) {
      this.logger.warn(
        { participantId: message.participant_id, expected: tokens.length, got: message.seq },
        'Sequence mismatch'
      );
      return;
    }

    // Track first token time for research
    if (message.seq === 0) {
      if (!this.firstTokenTime.has(participantKey)) {
        this.firstTokenTime.set(participantKey, new Map());
      }
      this.firstTokenTime.get(participantKey)!.set(message.round, now);

      // Log first token event
      const session = await this.prisma.session.findFirst({
        where: { status: 'active' },
      });
      if (session) {
        await this.eventLogger?.log({
          sessionId: session.id,
          eventType: 'first_token_received',
          actorType: 'participant',
          actorId: participantKey,
          targetType: 'round',
          metadata: { round: message.round },
        });
      }
    }

    tokens.push(message.content);

    // Broadcast to telao
    this.broadcastToTelao({
      type: 'token_update',
      participant_id: message.participant_id,
      round: message.round,
      seq: message.seq,
      content: message.content,
      total_tokens: tokens.length,
    });
  }

  private async handleComplete(message: CompleteMessage) {
    try {
      const completionTime = new Date();

      // Find round by index in the ACTIVE session only
      const round = await this.prisma.round.findFirst({
        where: {
          index: message.round,
          session: {
            status: 'active',
          },
        },
        include: { session: true },
      });

      if (!round) {
        this.logger.error({ round: message.round }, 'Round not found in active session');
        return;
      }

      const tpsAvg = message.duration_ms > 0
        ? (message.tokens / message.duration_ms) * 1000
        : null;

      // Get generated content from token buffer
      const participantTokens = this.tokenBuffer.get(message.participant_id);
      const roundTokens = participantTokens?.get(message.round);
      const generatedContent = roundTokens ? roundTokens.join('') : null;

      // Get first token timestamp for research
      const firstTokenAt = this.firstTokenTime.get(message.participant_id)?.get(message.round);

      // Calculate generation start time from first token minus latency
      const generationStartedAt = firstTokenAt && message.latency_ms_first_token
        ? new Date(firstTokenAt.getTime() - message.latency_ms_first_token)
        : round.startedAt;

      await this.prisma.metrics.upsert({
        where: {
          roundId_participantId: {
            roundId: round.id,
            participantId: message.participant_id,
          },
        },
        create: {
          roundId: round.id,
          participantId: message.participant_id,
          tokens: message.tokens,
          latencyFirstTokenMs: message.latency_ms_first_token,
          durationMs: message.duration_ms,
          tpsAvg,
          modelInfo: message.model_info ? JSON.stringify(message.model_info) : null,
          generatedContent,
          generationStartedAt,
          generationEndedAt: completionTime,
          firstTokenAt,
        },
        update: {
          tokens: message.tokens,
          latencyFirstTokenMs: message.latency_ms_first_token,
          durationMs: message.duration_ms,
          tpsAvg,
          modelInfo: message.model_info ? JSON.stringify(message.model_info) : null,
          generatedContent,
          generationStartedAt,
          generationEndedAt: completionTime,
          firstTokenAt,
        },
      });

      this.logger.info(
        { participantId: message.participant_id, round: message.round, tokens: message.tokens },
        'Completion recorded'
      );

      // Log generation completed event for research
      await this.eventLogger?.log({
        sessionId: round.sessionId,
        eventType: 'generation_completed',
        actorType: 'participant',
        actorId: message.participant_id,
        targetType: 'round',
        targetId: round.id,
        metadata: {
          roundIndex: message.round,
          tokens: message.tokens,
          durationMs: message.duration_ms,
          latencyFirstTokenMs: message.latency_ms_first_token,
          tpsAvg,
        },
      });

      // Broadcast completion
      this.broadcastToTelao({
        type: 'completion',
        participant_id: message.participant_id,
        round: message.round,
        tokens: message.tokens,
        duration_ms: message.duration_ms,
      });
    } catch (error) {
      this.logger.error({ error }, 'Failed to record completion');
    }
  }

  private async handleDisconnection(connId: string) {
    const conn = this.connections.get(connId);
    if (conn) {
      this.logger.info({ participantId: conn.participantId }, 'Participant disconnected');

      // Update lastSeen and connected=false in the database so frontends can detect offline participants
      try {
        await this.prisma.participant.update({
          where: { id: conn.participantId },
          data: { lastSeen: new Date(), connected: false },
        });

        // Log disconnection event for research
        await this.eventLogger?.log({
          sessionId: conn.sessionId,
          eventType: 'participant_disconnected',
          actorType: 'participant',
          actorId: conn.participantId,
          targetType: 'participant',
          targetId: conn.participantId,
        });

        // Notify telao (or any pollers) that participant updated
        this.broadcastToTelao({
          type: 'participant_disconnected',
          participant_id: conn.participantId,
          ts: Date.now(),
        });
      } catch (error) {
        this.logger.error({ error, participantId: conn.participantId }, 'Failed to update participant lastSeen/connected on disconnect');
      }

      this.connections.delete(connId);
    }

    // Also remove from telao connections if present
    if (this.telaoConnections.has(connId)) {
      this.logger.info({ connId }, 'Telao disconnected');
      this.telaoConnections.delete(connId);
    }
  }

  broadcast(message: ServerMessage) {
    const payload = JSON.stringify(message);
    for (const conn of this.connections.values()) {
      try {
        conn.ws.send(payload);
      } catch (error) {
        this.logger.error({ error, participantId: conn.participantId }, 'Broadcast failed');
      }
    }
  }

  broadcastToTelao(message: any) {
    const payload = JSON.stringify(message);
    const telaoCount = this.telaoConnections.size;

    if (telaoCount === 0) {
      this.logger.warn({ messageType: message.type }, 'No telao connections to broadcast to');
      return;
    }

    for (const [id, ws] of this.telaoConnections.entries()) {
      try {
        ws.send(payload);
      } catch (error) {
        this.logger.error({ error, telaoConn: id }, 'Failed to send message to telao');
      }
    }

    // Log token_update broadcasts at info level for debugging
    if (message.type === 'token_update') {
      this.logger.info({
        participantId: message.participant_id,
        seq: message.seq,
        telaoCount
      }, 'Broadcast token_update to telao');
    } else {
      this.logger.debug({ messageType: message.type, telaoCount }, 'Broadcasted to telao connections');
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.broadcast({
        type: 'heartbeat',
        ts: Date.now(),
      });
    }, 30000); // 30s
  }

  async getActiveParticipants(sessionId: string) {
    return this.prisma.participant.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getCurrentRoundTokens(roundIndex: number) {
    const result = new Map<string, string[]>();

    for (const [participantId, rounds] of this.tokenBuffer) {
      const tokens = rounds.get(roundIndex);
      if (tokens) {
        result.set(participantId, tokens);
      }
    }

    return result;
  }

  /**
   * Disconnect all participants (used when creating a new session)
   */
  disconnectAllParticipants(reason: string = 'Session ended') {
    const count = this.connections.size;

    for (const conn of this.connections.values()) {
      try {
        // Send disconnect message before closing
        conn.ws.send(JSON.stringify({
          type: 'error',
          message: reason,
          code: 'SESSION_ENDED'
        }));
        conn.ws.close();
      } catch (error) {
        this.logger.error({ error, participantId: conn.participantId }, 'Error disconnecting participant');
      }
    }

    this.connections.clear();
    this.tokenBuffer.clear();

    this.logger.info({ count, reason }, 'Disconnected all participants');

    return count;
  }

  /**
   * Get count of connected participants
   */
  getConnectedCount(): number {
    return this.connections.size;
  }

  cleanup() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    for (const conn of this.connections.values()) {
      conn.ws.close();
    }

    this.connections.clear();
    this.tokenBuffer.clear();
  }
}
