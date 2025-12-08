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

// Extend client message union to accept telao registrations
export const ExtendedClientMessageSchema = z.discriminatedUnion('type', [
  RegisterMessageSchema,
  TokenMessageSchema,
  CompleteMessageSchema,
  ErrorMessageSchema,
  TelaoRegisterMessageSchema,
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
