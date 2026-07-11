import { z } from 'zod';

// Server -> Client messages
export const ChallengeMessageSchema = z.object({
  type: z.literal('challenge'),
  session_id: z.string(),
  round: z.number(),
  prompt: z.string(),
  max_tokens: z.number(),
  temperature: z.number(),
  deadline_ms: z.number(),
  seed: z.number().optional(),
});

export const HeartbeatMessageSchema = z.object({
  type: z.literal('heartbeat'),
  ts: z.number(),
});

export const ServerMessageSchema = z.discriminatedUnion('type', [
  ChallengeMessageSchema,
  HeartbeatMessageSchema,
]);

// Client -> Server messages
export const RegisterMessageSchema = z.object({
  type: z.literal('register'),
  participant_id: z.string(),
  nickname: z.string(),
  pin: z.string(),
  runner: z.string(),
  model: z.string(),
});

export const TokenMessageSchema = z.object({
  type: z.literal('token'),
  round: z.number(),
  participant_id: z.string(),
  seq: z.number(),
  content: z.string(),
});

export const CompleteMessageSchema = z.object({
  type: z.literal('complete'),
  round: z.number(),
  participant_id: z.string(),
  tokens: z.number(),
  latency_ms_first_token: z.number().optional(),
  duration_ms: z.number(),
  model_info: z.object({
    name: z.string(),
    runner: z.string(),
    device: z.string().optional(),
  }).optional(),
});

export const ErrorMessageSchema = z.object({
  type: z.literal('error'),
  round: z.number(),
  participant_id: z.string(),
  code: z.string(),
  message: z.string(),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  RegisterMessageSchema,
  TokenMessageSchema,
  CompleteMessageSchema,
  ErrorMessageSchema,
]);

export const TelaoRegisterMessageSchema = z.object({
  type: z.literal('telao_register'),
  view: z.string().optional(),
});

// ============ WORLD MODE (agent arena) ============
export const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'STAY'] as const;

// Agent enters the 2D world (sent after `register`)
export const WorldJoinMessageSchema = z.object({
  type: z.literal('world_join'),
  participant_id: z.string(),
  emoji: z.string().optional(),
  color: z.string().optional(),
  strategy_summary: z.string().optional(),
});

// Agent's movement decision (reply to a `perception`)
// Participante salvou um template de prompt customizado no /agent — vai para
// o event log (pesquisa: cruzar prompt x desempenho nos world_snapshots).
export const AgentPromptMessageSchema = z.object({
  type: z.literal('agent_prompt'),
  participant_id: z.string(),
  template: z.string().min(1).max(4000),
  is_default: z.boolean().optional(),
});

export const AgentActionMessageSchema = z.object({
  type: z.literal('agent_action'),
  participant_id: z.string(),
  direction: z.enum(DIRECTIONS),
  say: z.string().optional(),
  pulse: z.number().optional(),
});

// Extend client message union to accept telao registrations + world messages
export const ExtendedClientMessageSchema = z.discriminatedUnion('type', [
  RegisterMessageSchema,
  TokenMessageSchema,
  CompleteMessageSchema,
  ErrorMessageSchema,
  TelaoRegisterMessageSchema,
  WorldJoinMessageSchema,
  AgentActionMessageSchema,
  AgentPromptMessageSchema,
]);

// Vote messages
export const VoteMessageSchema = z.object({
  type: z.literal('vote'),
  round: z.number(),
  voter_id: z.string(),
  participant_id: z.string(),
  score: z.number().min(0).max(5),
});

// Type exports
export type ChallengeMessage = z.infer<typeof ChallengeMessageSchema>;
export type HeartbeatMessage = z.infer<typeof HeartbeatMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export type RegisterMessage = z.infer<typeof RegisterMessageSchema>;
export type TokenMessage = z.infer<typeof TokenMessageSchema>;
export type CompleteMessage = z.infer<typeof CompleteMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ExtendedClientMessage = z.infer<typeof ExtendedClientMessageSchema>;

export type VoteMessage = z.infer<typeof VoteMessageSchema>;

// World mode types
export type Direction = (typeof DIRECTIONS)[number];
export type WorldJoinMessage = z.infer<typeof WorldJoinMessageSchema>;
export type AgentActionMessage = z.infer<typeof AgentActionMessageSchema>;
export type AgentPromptMessage = z.infer<typeof AgentPromptMessageSchema>;

// Server -> agent: a radar pulse
export interface PerceptionMessage {
  type: 'perception';
  pulse: number;
  objective: string; // the game goal, so the agent's prompt always includes it
  nearest_food: { direction: Direction; distance: string } | null;
  walls: string;
  position: string;
  score: number;
  bumped: boolean; // the previous move hit a wall (clamped) — agent may be stuck
  radar_text: string; // pre-rendered PT sentence to drop into the LLM prompt
}

// Server -> telao: full world snapshot
export interface WorldStateMessage {
  type: 'world_state';
  t: number;
  running: boolean;
  objective: string;
  config: { width: number; height: number };
  agents: Array<{
    id: string;
    nickname: string;
    emoji: string;
    color: string;
    x: number;
    y: number;
    heading: number;
    score: number;
    say: string | null;
    radarAt: number | null;
    bumpedAt: number | null; // epoch ms of last wall collision (telao shake/impact fx)
    isBot: boolean;
  }>;
  food: Array<{ id: string; x: number; y: number }>;
}
