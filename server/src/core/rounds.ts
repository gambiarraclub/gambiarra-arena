import { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type { WebSocketHub } from '../ws/hub.js';
import type { EventLogger } from './eventlog.js';

export interface CreateRoundParams {
  sessionId: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  deadlineMs?: number;
  seed?: number;
  svgMode?: boolean;
}

export class RoundManager {
  constructor(
    private prisma: PrismaClient,
    private hub: WebSocketHub,
    private logger: FastifyBaseLogger,
    private eventLogger?: EventLogger
  ) {}

  async createRound(params: CreateRoundParams) {
    const session = await this.prisma.session.findUnique({
      where: { id: params.sessionId },
      include: { rounds: true },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    const nextIndex = session.rounds.length + 1;

    const round = await this.prisma.round.create({
      data: {
        sessionId: params.sessionId,
        index: nextIndex,
        prompt: params.prompt,
        maxTokens: params.maxTokens ?? 400,
        temperature: params.temperature ?? 0.8,
        deadlineMs: params.deadlineMs ?? 90000,
        seed: params.seed,
        svgMode: params.svgMode ?? false,
      },
    });

    this.logger.info({ roundId: round.id, index: round.index }, 'Round created');

    // Log event for research
    await this.eventLogger?.log({
      sessionId: params.sessionId,
      eventType: 'round_created',
      actorType: 'admin',
      targetType: 'round',
      targetId: round.id,
      metadata: {
        index: round.index,
        prompt: round.prompt,
        maxTokens: round.maxTokens,
        temperature: round.temperature,
        deadlineMs: round.deadlineMs,
        svgMode: round.svgMode,
      },
    });

    return round;
  }

  async startRound(roundId: string) {
    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
      include: { session: true },
    });

    if (!round) {
      throw new Error('Round not found');
    }

    if (round.startedAt) {
      throw new Error('Round already started');
    }

    const updatedRound = await this.prisma.round.update({
      where: { id: roundId },
      data: { startedAt: new Date() },
    });

    // Broadcast challenge to all participants
    this.hub.broadcast({
      type: 'challenge',
      session_id: round.sessionId,
      round: round.index,
      prompt: round.prompt,
      max_tokens: round.maxTokens,
      temperature: round.temperature,
      deadline_ms: round.deadlineMs,
      seed: round.seed ?? undefined,
    });

    this.logger.info({ roundId, index: round.index }, 'Round started');

    // Log event for research
    await this.eventLogger?.log({
      sessionId: round.sessionId,
      eventType: 'round_started',
      actorType: 'admin',
      targetType: 'round',
      targetId: roundId,
      metadata: { index: round.index },
    });

    return updatedRound;
  }

  async stopRound(roundId: string) {
    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
      include: { metrics: true },
    });

    if (!round) {
      throw new Error('Round not found');
    }

    if (!round.startedAt) {
      throw new Error('Round not started');
    }

    if (round.endedAt) {
      throw new Error('Round already ended');
    }

    // Check if there are any responses
    if (round.metrics.length === 0) {
      throw new Error('Não há respostas para esta rodada. Aguarde participantes completarem ou cancele a rodada.');
    }

    // Stop round and automatically open voting
    const updatedRound = await this.prisma.round.update({
      where: { id: roundId },
      data: {
        endedAt: new Date(),
        votingStatus: 'open',
      },
    });

    this.logger.info({ roundId, index: round.index, responses: round.metrics.length }, 'Round stopped, voting opened');

    // Log events for research
    await this.eventLogger?.log({
      sessionId: round.sessionId,
      eventType: 'round_stopped',
      actorType: 'admin',
      targetType: 'round',
      targetId: roundId,
      metadata: { index: round.index, responses: round.metrics.length },
    });

    await this.eventLogger?.log({
      sessionId: round.sessionId,
      eventType: 'voting_opened',
      actorType: 'system',
      targetType: 'round',
      targetId: roundId,
    });

    return updatedRound;
  }

  async closeVoting(roundId: string) {
    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
    });

    if (!round) {
      throw new Error('Round not found');
    }

    if (round.votingStatus !== 'open') {
      throw new Error('Voting is not open');
    }

    const updatedRound = await this.prisma.round.update({
      where: { id: roundId },
      data: { votingStatus: 'closed' },
    });

    this.logger.info({ roundId, index: round.index }, 'Voting closed');

    // Log event for research
    await this.eventLogger?.log({
      sessionId: round.sessionId,
      eventType: 'voting_closed',
      actorType: 'admin',
      targetType: 'round',
      targetId: roundId,
    });

    return updatedRound;
  }

  async startReveal(roundId: string) {
    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
    });

    if (!round) {
      throw new Error('Round not found');
    }

    if (!round.endedAt) {
      throw new Error('Round has not ended');
    }

    if (round.votingStatus === 'open') {
      throw new Error('Close voting first');
    }

    const updatedRound = await this.prisma.round.update({
      where: { id: roundId },
      data: {
        votingStatus: 'revealed',
        revealedCount: 0,
      },
    });

    this.logger.info({ roundId, index: round.index }, 'Award ceremony started');

    // Log event for research
    await this.eventLogger?.log({
      sessionId: round.sessionId,
      eventType: 'reveal_started',
      actorType: 'admin',
      targetType: 'round',
      targetId: roundId,
    });

    return updatedRound;
  }

  async revealNext(roundId: string) {
    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
      include: { metrics: true },
    });

    if (!round) {
      throw new Error('Round not found');
    }

    if (round.votingStatus !== 'revealed') {
      throw new Error('Award ceremony not started');
    }

    const totalParticipants = round.metrics.length;

    if (round.revealedCount >= totalParticipants) {
      throw new Error('All positions already revealed');
    }

    const updatedRound = await this.prisma.round.update({
      where: { id: roundId },
      data: { revealedCount: round.revealedCount + 1 },
    });

    this.logger.info(
      { roundId, index: round.index, revealed: updatedRound.revealedCount, total: totalParticipants },
      'Position revealed'
    );

    // Log event for research
    await this.eventLogger?.log({
      sessionId: round.sessionId,
      eventType: 'position_revealed',
      actorType: 'admin',
      targetType: 'round',
      targetId: roundId,
      metadata: {
        position: totalParticipants - updatedRound.revealedCount + 1,
        revealedCount: updatedRound.revealedCount,
        totalParticipants,
      },
    });

    return updatedRound;
  }

  async getCurrentRound(sessionId: string) {
    return this.prisma.round.findFirst({
      where: {
        sessionId,
        startedAt: { not: null },
        endedAt: null,
      },
      orderBy: { index: 'desc' },
    });
  }

  async getRoundMetrics(roundId: string) {
    return this.prisma.metrics.findMany({
      where: { roundId },
      include: { participant: true },
    });
  }
}
