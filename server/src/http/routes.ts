import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { RoundManager } from '../core/rounds.js';
import { VoteManager } from '../core/votes.js';
import { MetricsManager } from '../core/metrics.js';
import { EventLogger } from '../core/eventlog.js';
import type { WebSocketHub } from '../ws/hub.js';

const CreateSessionSchema = z.object({
  pinLength: z.number().optional().default(6),
});

const CreateRoundSchema = z.object({
  prompt: z.string(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  deadlineMs: z.number().optional(),
  seed: z.number().optional(),
  svgMode: z.boolean().optional(),
});

const StartRoundSchema = z.object({
  roundId: z.string(),
});

const StopRoundSchema = z.object({
  roundId: z.string(),
});

const CastVoteSchema = z.object({
  roundId: z.string(),
  participantId: z.string(),
  score: z.number().min(0).max(5),
  voterId: z.string().optional(), // Optional: use localStorage ID from client
  responseTime: z.number().optional(), // ms from viewing response to voting
  userAgent: z.string().optional(), // browser/device info
});

const RoundIdSchema = z.object({
  roundId: z.string(),
});

const GetVotedSchema = z.object({
  roundId: z.string(),
  voterId: z.string(),
});

const KickParticipantSchema = z.object({
  participantId: z.string(),
});

export async function setupRoutes(
  app: FastifyInstance,
  hub: WebSocketHub,
  roundManager: RoundManager,
  voteManager: VoteManager,
  metricsManager: MetricsManager,
  eventLogger?: EventLogger
) {
  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: Date.now() };
  });

  // Get active session
  app.get('/session', async (request, reply) => {
    const session = await app.prisma.session.findFirst({
      where: { status: 'active' },
      include: {
        participants: true,
        rounds: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      return reply.code(404).send({ error: 'No active session' });
    }

    // Don't return PIN hash, but keep plain PIN for admin
    const { pinHash, ...sessionData } = session;

    return sessionData;
  });

  // Get current round
  app.get('/rounds/current', async (request, reply) => {
    const session = await app.prisma.session.findFirst({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      return reply.code(404).send({ error: 'No active session' });
    }

    const round = await roundManager.getCurrentRound(session.id);

    if (!round) {
      return reply.code(404).send({ error: 'No active round' });
    }

    // Get live tokens
    const tokens = await hub.getCurrentRoundTokens(round.index);

    return {
      ...round,
      liveTokens: Object.fromEntries(tokens),
    };
  });

  // Get scoreboard
  app.get('/scoreboard', async (request, reply) => {
    const query = request.query as { roundId?: string };

    let roundId = query.roundId;

    if (!roundId) {
      const session = await app.prisma.session.findFirst({
        where: { status: 'active' },
        orderBy: { createdAt: 'desc' },
      });

      if (!session) {
        return reply.code(404).send({ error: 'No active session' });
      }

      // Try to get the most recently ended round first, then active round
      let round = await app.prisma.round.findFirst({
        where: {
          sessionId: session.id,
          endedAt: { not: null },
        },
        orderBy: { index: 'desc' },
      });

      if (!round) {
        round = await roundManager.getCurrentRound(session.id);
      }

      if (!round) {
        return reply.code(404).send({ error: 'No round found' });
      }

      roundId = round.id;
    }

    const scoreboard = await voteManager.getScoreboard(roundId);

    return scoreboard;
  });

  // Get metrics
  app.get('/metrics', async (request, reply) => {
    const session = await app.prisma.session.findFirst({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      return reply.code(404).send({ error: 'No active session' });
    }

    const metrics = await metricsManager.getSessionMetrics(session.id);

    return metrics;
  });

  // Export CSV
  app.get('/export.csv', async (request, reply) => {
    const session = await app.prisma.session.findFirst({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      return reply.code(404).send({ error: 'No active session' });
    }

    const csv = await metricsManager.exportToCSV(session.id);

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="session-${session.id}.csv"`);

    return csv;
  });

  // Create session
  app.post('/session', async (request, reply) => {
    const body = CreateSessionSchema.parse(request.body);

    // Generate PIN
    const pin = Math.random()
      .toString()
      .slice(2, 2 + body.pinLength)
      .padStart(body.pinLength, '0');
    const pinHash = await bcrypt.hash(pin, 10);

    // Disconnect all participants from previous session
    const disconnectedCount = hub.disconnectAllParticipants('Nova sessão criada. Reconecte com o novo PIN.');

    // Mark all participants as disconnected in the database
    await app.prisma.participant.updateMany({
      data: { connected: false },
    });

    // End previous active sessions
    await app.prisma.session.updateMany({
      where: { status: 'active' },
      data: { status: 'ended' },
    });

    // Create new session
    const session = await app.prisma.session.create({
      data: {
        pin,     // Store plain PIN for admin display
        pinHash, // Store hash for verification
        status: 'active',
      },
    });

    app.log.info({ sessionId: session.id, pin, disconnectedCount }, 'Session created');

    // Log event for research
    await eventLogger?.log({
      sessionId: session.id,
      eventType: 'session_created',
      actorType: 'admin',
      targetType: 'session',
      targetId: session.id,
      metadata: { disconnectedPreviousParticipants: disconnectedCount },
    });

    return {
      session_id: session.id,
      pin, // Only return PIN on creation
      created_at: session.createdAt,
      disconnected_participants: disconnectedCount,
    };
  });

  // Create round
  app.post('/rounds', async (request, reply) => {
    const body = CreateRoundSchema.parse(request.body);

    const session = await app.prisma.session.findFirst({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      return reply.code(404).send({ error: 'No active session' });
    }

    const round = await roundManager.createRound({
      sessionId: session.id,
      ...body,
    });

    return round;
  });

  // Start round
  app.post('/rounds/start', async (request, reply) => {
    const body = StartRoundSchema.parse(request.body);

    const round = await roundManager.startRound(body.roundId);

    return round;
  });

  // Stop round
  app.post('/rounds/stop', async (request, reply) => {
    const body = StopRoundSchema.parse(request.body);

    const round = await roundManager.stopRound(body.roundId);

    return round;
  });

  // Cast vote
  app.post('/votes', async (request, reply) => {
    const body = CastVoteSchema.parse(request.body);

    // Use provided voterId or fall back to IP
    const voterId = body.voterId || request.ip;
    // Get user agent from request headers if not provided
    const userAgent = body.userAgent || request.headers['user-agent'];

    try {
      const vote = await voteManager.castVote({
        roundId: body.roundId,
        voterId,
        participantId: body.participantId,
        score: body.score,
        responseTime: body.responseTime,
        userAgent,
      });

      return vote;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cast vote';
      return reply.code(400).send({ error: message });
    }
  });

  // Get voted participants for a voter
  app.get('/votes/mine', async (request, reply) => {
    const query = GetVotedSchema.parse(request.query);

    const votes = await voteManager.getVotedParticipants(query.roundId, query.voterId);

    return votes;
  });

  // Close voting for a round
  app.post('/rounds/:roundId/close-voting', async (request, reply) => {
    const { roundId } = request.params as { roundId: string };

    try {
      const round = await roundManager.closeVoting(roundId);
      return round;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to close voting';
      return reply.code(400).send({ error: message });
    }
  });

  // Start reveal ceremony
  app.post('/rounds/:roundId/reveal', async (request, reply) => {
    const { roundId } = request.params as { roundId: string };

    try {
      const round = await roundManager.startReveal(roundId);
      return round;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start reveal';
      return reply.code(400).send({ error: message });
    }
  });

  // Reveal next position
  app.post('/rounds/:roundId/reveal-next', async (request, reply) => {
    const { roundId } = request.params as { roundId: string };

    try {
      const round = await roundManager.revealNext(roundId);
      return round;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reveal next';
      return reply.code(400).send({ error: message });
    }
  });

  // Get responses for voting
  app.get('/rounds/:roundId/responses', async (request, reply) => {
    const { roundId } = request.params as { roundId: string };

    try {
      const responses = await voteManager.getRoundResponses(roundId);
      return responses;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get responses';
      return reply.code(400).send({ error: message });
    }
  });

  // Kick participant
  app.post('/participants/kick', async (request, reply) => {
    const body = KickParticipantSchema.parse(request.body);

    await app.prisma.participant.delete({
      where: { id: body.participantId },
    });

    return { status: 'ok' };
  });

  // Export events as CSV for research
  app.get('/export-events.csv', async (request, reply) => {
    const session = await app.prisma.session.findFirst({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      return reply.code(404).send({ error: 'No active session' });
    }

    const events = await app.prisma.eventLog.findMany({
      where: { sessionId: session.id },
      orderBy: { timestamp: 'asc' },
    });

    // Build CSV
    const headers = ['id', 'timestamp', 'eventType', 'actorType', 'actorId', 'targetType', 'targetId', 'metadata'];
    const rows = events.map((e) => [
      e.id,
      e.timestamp.toISOString(),
      e.eventType,
      e.actorType,
      e.actorId || '',
      e.targetType || '',
      e.targetId || '',
      e.metadata || '',
    ].map((val) => `"${String(val).replace(/"/g, '""')}"`).join(','));

    const csv = [headers.join(','), ...rows].join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="events-${session.id}.csv"`);

    return csv;
  });

  // Export all session data as JSON for research
  app.get('/export-all.json', async (request, reply) => {
    const session = await app.prisma.session.findFirst({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
      include: {
        participants: true,
        rounds: {
          include: {
            metrics: true,
            votes: true,
          },
        },
        events: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!session) {
      return reply.code(404).send({ error: 'No active session' });
    }

    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="session-${session.id}-full.json"`);

    return session;
  });
}
