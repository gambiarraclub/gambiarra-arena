import { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

export type EventType =
  | 'session_created'
  | 'session_ended'
  | 'round_created'
  | 'round_started'
  | 'round_stopped'
  | 'voting_opened'
  | 'voting_closed'
  | 'reveal_started'
  | 'position_revealed'
  | 'participant_connected'
  | 'participant_disconnected'
  | 'participant_registered'
  | 'generation_started'
  | 'generation_completed'
  | 'first_token_received'
  | 'vote_cast';

export type ActorType = 'admin' | 'participant' | 'voter' | 'system';
export type TargetType = 'session' | 'round' | 'participant' | 'vote' | 'metrics';

export interface LogEventParams {
  sessionId?: string;
  eventType: EventType;
  actorType: ActorType;
  actorId?: string;
  targetType?: TargetType;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export class EventLogger {
  constructor(
    private prisma: PrismaClient,
    private logger: FastifyBaseLogger
  ) {}

  async log(params: LogEventParams) {
    try {
      const event = await this.prisma.eventLog.create({
        data: {
          sessionId: params.sessionId,
          eventType: params.eventType,
          actorType: params.actorType,
          actorId: params.actorId,
          targetType: params.targetType,
          targetId: params.targetId,
          metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        },
      });

      this.logger.debug(
        { eventId: event.id, eventType: params.eventType },
        'Event logged'
      );

      return event;
    } catch (error) {
      this.logger.error({ error, params }, 'Failed to log event');
      // Don't throw - event logging should not break the main flow
      return null;
    }
  }

  async getSessionEvents(sessionId: string) {
    return this.prisma.eventLog.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'asc' },
    });
  }

  async getEventsByType(eventType: EventType, sessionId?: string) {
    return this.prisma.eventLog.findMany({
      where: {
        eventType,
        ...(sessionId && { sessionId }),
      },
      orderBy: { timestamp: 'desc' },
    });
  }
}
