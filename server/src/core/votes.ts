import { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { createHash } from 'crypto';
import type { EventLogger } from './eventlog.js';

export interface CastVoteParams {
  roundId: string;
  voterId: string;
  participantId: string;
  score: number;
  responseTime?: number; // ms from viewing response to voting
  userAgent?: string; // browser/device info
}

export class VoteManager {
  constructor(
    private prisma: PrismaClient,
    private logger: FastifyBaseLogger,
    private eventLogger?: EventLogger
  ) {}

  async castVote(params: CastVoteParams) {
    const { roundId, voterId, participantId, score, responseTime, userAgent } = params;

    // Hash voter ID for privacy
    const voterHash = createHash('sha256').update(voterId).digest('hex');

    // Check if round exists and voting is open
    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
      select: { id: true, sessionId: true, votingStatus: true },
    });

    if (!round) {
      throw new Error('Round not found');
    }

    if (round.votingStatus !== 'open') {
      throw new Error('Voting is not open for this round');
    }

    // Check if participant exists
    const participant = await this.prisma.participant.findUnique({
      where: { id: participantId },
    });

    if (!participant) {
      throw new Error('Participant not found');
    }

    // Validate score (0-5)
    if (score < 0 || score > 5) {
      throw new Error('Score must be between 0 and 5');
    }

    // Check if already voted for this participant
    const existingVote = await this.prisma.vote.findUnique({
      where: {
        roundId_voterHash_participantId: {
          roundId,
          voterHash,
          participantId,
        },
      },
    });

    if (existingVote) {
      throw new Error('Already voted for this participant');
    }

    // Calculate vote order (how many votes this voter has cast in this round)
    const previousVotesCount = await this.prisma.vote.count({
      where: {
        roundId,
        voterHash,
      },
    });
    const voteOrder = previousVotesCount + 1;

    // Create vote (cannot be changed)
    const vote = await this.prisma.vote.create({
      data: {
        roundId,
        voterHash,
        participantId,
        score,
        voteOrder,
        responseTime,
        userAgent,
      },
    });

    this.logger.info({ roundId, participantId, score, voteOrder }, 'Vote cast');

    // Log event for research
    await this.eventLogger?.log({
      sessionId: round.sessionId,
      eventType: 'vote_cast',
      actorType: 'voter',
      actorId: voterHash,
      targetType: 'vote',
      targetId: vote.id,
      metadata: {
        participantId,
        score,
        voteOrder,
        responseTime,
      },
    });

    return vote;
  }

  async getVotedParticipants(roundId: string, voterId: string) {
    const voterHash = createHash('sha256').update(voterId).digest('hex');

    const votes = await this.prisma.vote.findMany({
      where: {
        roundId,
        voterHash,
      },
      select: {
        participantId: true,
        score: true,
      },
    });

    return votes;
  }

  async getRoundVotes(roundId: string) {
    return this.prisma.vote.findMany({
      where: { roundId },
      include: { participant: true },
    });
  }

  async getScoreboard(roundId: string) {
    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
    });

    const votes = await this.prisma.vote.findMany({
      where: { roundId },
      include: { participant: true },
    });

    const metrics = await this.prisma.metrics.findMany({
      where: { roundId },
      include: { participant: true },
    });

    // Aggregate votes by participant
    const votesByParticipant = new Map<string, number[]>();
    for (const vote of votes) {
      if (!votesByParticipant.has(vote.participantId)) {
        votesByParticipant.set(vote.participantId, []);
      }
      votesByParticipant.get(vote.participantId)!.push(vote.score);
    }

    // Calculate scoreboard
    const scoreboard = metrics.map((m) => {
      const participantVotes = votesByParticipant.get(m.participantId) || [];
      const totalVotes = participantVotes.length;
      const avgScore = totalVotes > 0
        ? participantVotes.reduce((a, b) => a + b, 0) / totalVotes
        : 0;

      return {
        participant_id: m.participantId,
        nickname: m.participant.nickname,
        tokens: m.tokens,
        latency_first_token_ms: m.latencyFirstTokenMs,
        duration_ms: m.durationMs,
        tps_avg: m.tpsAvg,
        votes: totalVotes,
        avg_score: avgScore,
        total_score: avgScore * totalVotes,
        generated_content: m.generatedContent,
      };
    });

    // Sort by avg_score descending (changed from total_score)
    scoreboard.sort((a, b) => b.avg_score - a.avg_score);

    return {
      scoreboard,
      svgMode: round?.svgMode ?? false,
      votingStatus: round?.votingStatus ?? 'closed',
      revealedCount: round?.revealedCount ?? 0,
    };
  }

  async getRoundResponses(roundId: string) {
    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
    });

    if (!round) {
      throw new Error('Round not found');
    }

    const metrics = await this.prisma.metrics.findMany({
      where: { roundId },
      include: { participant: true },
    });

    const responses = metrics.map((m) => ({
      participant_id: m.participantId,
      nickname: m.participant.nickname,
      generated_content: m.generatedContent,
    }));

    return {
      responses,
      svgMode: round.svgMode,
      votingStatus: round.votingStatus,
      prompt: round.prompt,
    };
  }
}
