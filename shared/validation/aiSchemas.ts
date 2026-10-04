// ============================================================================
// FILE: shared/validation/aiSchemas.ts
//
// PURPOSE:
// Canonical shared validation for the generic Veyra AI contract.
//
// ARCHITECTURE:
//
// shared/types/ai.ts
//        │
//        ▼
// shared/validation/aiSchemas.ts
//        │
//        ├── client validation
//        ├── IPC validation
//        ├── API validation
//        └── runtime boundary validation
//
// IMPORTANT:
//
// This schema is GENERIC.
//
// It is NOT document-specific.
//
// It must remain capable of validating AI requests originating from:
// - documents
// - vision
// - audio
// - conversation
// - interview
// - context
// - candidate
// - coding
// - general assistant operations
//
// Document-specific semantic validation belongs in:
//   shared/validation/documentSchemas.ts
//
// AI execution belongs in:
//   core/ai
// ============================================================================

import { z } from "zod";

// ============================================================================
// PROVIDER
// ============================================================================

/**
 * Canonical AI provider identifier.
 *
 * Provider IDs are intentionally dynamic because core/ai supports
 * runtime provider registration.
 *
 * Examples:
 *
 * local
 * ollama
 * gemini
 * groq
 * mistral
 * cerebras
 * cloud:gemini
 * custom-provider
 */
export const aiProviderSchema = z.string().trim().min(1).max(100);

// ============================================================================
// REQUEST MODE
// ============================================================================

/**
 * High-level application reasoning modes.
 *
 * IMPORTANT:
 *
 * These are NOT subsystem identifiers.
 *
 * Do not add values such as:
 *
 * document-analysis
 * vision-analysis
 * interview-analysis
 *
 * Subsystem operations belong in AI request metadata.
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

// ============================================================================
// MESSAGE
// ============================================================================

/**
 * AI conversation message.
 */
export const aiMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant"]),

    content: z.string().trim().min(1).max(200_000),
  })
  .strict();

// ============================================================================
// VISION INPUT
// ============================================================================

/**
 * Optional multimodal input.
 *
 * This remains generic because vision is one AI capability,
 * not a document-specific capability.
 */
export const aiVisionInputSchema = z
  .object({
    imagePath: z.string().trim().min(1).max(4096).optional(),

    imageDataUrl: z.string().trim().min(1).max(20_000_000).optional(),

    imageMimeType: z.string().trim().min(1).max(255).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.imagePath !== undefined || value.imageDataUrl !== undefined,
    {
      message: "AI vision input requires imagePath or imageDataUrl.",
    },
  );

// ============================================================================
// RESPONSE FORMAT
// ============================================================================

export const aiResponseFormatSchema = z.enum(["text", "json"]);

// ============================================================================
// REQUEST OPTIONS
// ============================================================================

/**
 * Canonical AI generation options.
 *
 * These correspond to AIRequestOptions in shared/types/ai.ts.
 */
export const aiRequestOptionsSchema = z
  .object({
    temperature: z.number().finite().min(0).max(2).optional(),

    maxTokens: z.number().int().positive().max(1_000_000).optional(),

    topP: z.number().finite().min(0).max(1).optional(),

    topK: z.number().int().positive().max(1_000_000).optional(),

    stopSequences: z.array(z.string().max(10_000)).max(100).optional(),

    responseFormat: aiResponseFormatSchema.optional(),

    metadata: z
      .record(
        z.string().trim().min(1).max(100),
        z.union([z.string(), z.number(), z.boolean()]),
      )
      .optional(),
  })
  .strict();

// ============================================================================
// AI REQUEST
// ============================================================================

/**
 * Canonical shared AI request validation.
 *
 * IMPORTANT:
 *
 * This schema intentionally does NOT validate AbortSignal.
 *
 * AIRequest.signal is runtime-only and must not cross IPC/HTTP
 * serialization boundaries.
 */
export const aiRequestSchema = z
  .object({
    requestId: z.string().uuid(),

    provider: aiProviderSchema.optional(),

    model: z.string().trim().min(1).max(200).optional(),

    /**
     * Optional because shared/types/ai.ts defines mode as optional.
     *
     * A higher-level router/orchestrator may supply it.
     */
    mode: aiRequestModeSchema.optional(),

    messages: z.array(aiMessageSchema).min(1).max(100),

    options: aiRequestOptionsSchema.optional(),

    vision: aiVisionInputSchema.optional(),

    /**
     * Runtime/transport timeout.
     */
    timeoutMs: z.number().int().positive().max(86_400_000).optional(),

    /**
     * Legacy/transport-compatible generation fields.
     *
     * The canonical generation configuration is request.options.
     *
     * These remain validated because shared/types/ai.ts currently
     * exposes them for compatibility.
     */
    temperature: z.number().finite().min(0).max(2).optional(),

    maxTokens: z.number().int().positive().max(1_000_000).optional(),

    stream: z.boolean().optional(),

    /**
     * Transport-safe metadata.
     *
     * Unlike options.metadata, top-level metadata is intentionally
     * restricted to strings because it may cross IPC/HTTP boundaries
     * directly.
     */
    metadata: z
      .record(z.string().trim().min(1).max(100), z.string())
      .optional(),
  })
  .strict();

// ============================================================================
// STREAM CANCELLATION
// ============================================================================

export const aiCancelStreamSchema = z
  .object({
    requestId: z.string().uuid(),

    reason: z.string().trim().max(500).optional(),
  })
  .strict();

// ============================================================================
// PROVIDER STATUS
// ============================================================================

export const aiProviderStatusRequestSchema = z
  .object({
    forceRefresh: z.boolean().optional(),
  })
  .strict();

// ============================================================================
// INFERRED TYPES
// ============================================================================

export type AIRequestInput = z.infer<typeof aiRequestSchema>;

export type AIProviderInput = z.infer<typeof aiProviderSchema>;

export type AIRequestModeInput = z.infer<typeof aiRequestModeSchema>;

export type AIMessageInput = z.infer<typeof aiMessageSchema>;

export type AIVisionInput = z.infer<typeof aiVisionInputSchema>;

export type AIRequestOptionsInput = z.infer<typeof aiRequestOptionsSchema>;

export type AIResponseFormatInput = z.infer<typeof aiResponseFormatSchema>;

export type AICancelStreamInput = z.infer<typeof aiCancelStreamSchema>;

export type AIProviderStatusRequestInput = z.infer<
  typeof aiProviderStatusRequestSchema
>;
