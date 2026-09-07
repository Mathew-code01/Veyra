// shared/validation/aiSchemas.ts

import { z } from "zod";

/**
 * Canonical AI provider schema.
 *
 * IMPORTANT:
 * This is the only shared validation module that should export
 * aiProviderSchema.
 */
export const aiProviderSchema = z.enum(["gemini", "ollama", "mock"]);

/**
 * Supported AI request modes.
 */
export const aiRequestModeSchema = z.enum([
  "behavioral",
  "technical",
  "coding",
  "system-design",
  "product",
  "case",
  "communication",
  "general",
]);

/**
 * AI message validation.
 */
export const aiMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant"]),

    content: z.string().trim().min(1).max(200_000),
  })
  .strict();

/**
 * AI request validation.
 */
export const aiRequestSchema = z
  .object({
    requestId: z.string().uuid(),

    provider: aiProviderSchema.optional(),

    model: z.string().trim().min(1).max(200).optional(),

    mode: aiRequestModeSchema,

    messages: z.array(aiMessageSchema).min(1).max(100),

    temperature: z.number().finite().min(0).max(2).optional(),

    maxTokens: z.number().int().positive().max(1_000_000).optional(),

    stream: z.boolean().optional(),

    metadata: z.record(z.string(), z.string()).optional(),
  })
  .strict();

/**
 * Stream cancellation validation.
 */
export const aiCancelStreamSchema = z
  .object({
    requestId: z.string().uuid(),

    reason: z.string().trim().max(500).optional(),
  })
  .strict();

/**
 * Provider status request validation.
 */
export const aiProviderStatusRequestSchema = z
  .object({
    forceRefresh: z.boolean().optional(),
  })
  .strict();

/**
 * Inferred request type.
 */
export type AIRequestInput = z.infer<typeof aiRequestSchema>;

/**
 * Inferred provider type.
 */
export type AIProviderInput = z.infer<typeof aiProviderSchema>;

/**
 * Inferred mode type.
 */
export type AIRequestModeInput = z.infer<typeof aiRequestModeSchema>;

/**
 * Inferred message type.
 */
export type AIMessageInput = z.infer<typeof aiMessageSchema>;

/**
 * Inferred cancellation request type.
 */
export type AICancelStreamInput = z.infer<typeof aiCancelStreamSchema>;

/**
 * Inferred provider status request type.
 */
export type AIProviderStatusRequestInput = z.infer<
  typeof aiProviderStatusRequestSchema
>;
