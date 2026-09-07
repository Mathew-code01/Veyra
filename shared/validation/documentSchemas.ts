// shared/validation/documentSchemas.ts


import { z } from "zod";

export const documentTypeSchema = z.enum([
  "resume",
  "cover-letter",
  "job-description",
  "project",
  "company-research",
  "notes",
  "other",
]);

export const documentFormatSchema = z.enum([
  "pdf",
  "docx",
  "txt",
  "md",
  "json",
  "unknown",
]);

export const documentCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(255),

    type: documentTypeSchema,

    format: documentFormatSchema,

    mimeType: z.string().trim().min(1).max(255),

    sizeBytes: z
      .number()
      .int()
      .nonnegative()
      .max(100 * 1024 * 1024),

    path: z.string().max(4096).optional(),
  })
  .strict();

export const documentReadSchema = z
  .object({
    documentId: z.string().uuid(),
  })
  .strict();

export const documentDeleteSchema = z
  .object({
    documentId: z.string().uuid(),
  })
  .strict();

export const documentListSchema = z
  .object({
    page: z.number().int().positive().optional(),

    pageSize: z.number().int().positive().max(100).optional(),

    search: z.string().trim().max(200).optional(),

    type: documentTypeSchema.optional(),
  })
  .strict();