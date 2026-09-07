// shared/validation/sessionSchemas.ts


import { z } from "zod";

export const interviewTypeSchema = z.enum([
  "behavioral",
  "technical",
  "coding",
  "system-design",
  "product",
  "case",
  "communication",
  "mixed",
  "unknown",
]);

export const aiProviderSchema = z.enum(["gemini", "ollama", "mock"]);

export const sessionSettingsSchema = z
  .object({
    interviewType: interviewTypeSchema,

    aiProvider: aiProviderSchema.optional(),

    aiModel: z.string().trim().min(1).max(200).optional(),

    enableAudio: z.boolean(),
    enableCapture: z.boolean(),
    enableVision: z.boolean(),

    enableTranscript: z.boolean(),
    enableConversationAnalysis: z.boolean(),

    retainTranscript: z.boolean(),
    retainCaptureMetadata: z.boolean(),
  })
  .strict();

export const sessionContextSchema = z
  .object({
    profileId: z.string().uuid().optional(),

    documentIds: z.array(z.string().uuid()).max(100),

    jobTitle: z.string().trim().max(300).optional(),

    companyName: z.string().trim().max(300).optional(),

    jobDescription: z.string().max(50_000).optional(),
  })
  .strict();

export const sessionStartSchema = z
  .object({
    sessionId: z.string().uuid().optional(),

    settings: sessionSettingsSchema,

    context: sessionContextSchema,
  })
  .strict();

export const sessionIdSchema = z
  .object({
    sessionId: z.string().uuid(),
  })
  .strict();

export const sessionStopSchema = z
  .object({
    sessionId: z.string().uuid(),

    reason: z.enum(["completed", "cancelled", "error", "user"]).optional(),
  })
  .strict();

export const sessionListSchema = z
  .object({
    page: z.number().int().positive().optional(),

    pageSize: z.number().int().positive().max(100).optional(),

    status: z
      .enum([
        "created",
        "starting",
        "active",
        "paused",
        "stopping",
        "completed",
        "cancelled",
        "failed",
      ])
      .optional(),
  })
  .strict();