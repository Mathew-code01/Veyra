// ============================================================================
// FILE: shared/validation/documentSchemas.ts
//
// PURPOSE:
// Shared validation for document requests and document semantic analysis.
//
// This is the canonical shared validation module for documents.
// ============================================================================

import { z } from "zod";

// ============================================================================
// DOCUMENT TYPES
// ============================================================================

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

// ============================================================================
// DOCUMENT CREATE
// ============================================================================

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

// ============================================================================
// DOCUMENT READ
// ============================================================================

export const documentReadSchema = z
  .object({
    documentId: z.string().uuid(),
  })
  .strict();

// ============================================================================
// DOCUMENT DELETE
// ============================================================================

export const documentDeleteSchema = z
  .object({
    documentId: z.string().uuid(),
  })
  .strict();

// ============================================================================
// DOCUMENT LIST
// ============================================================================

export const documentListSchema = z
  .object({
    page: z.number().int().positive().optional(),

    pageSize: z.number().int().positive().max(100).optional(),

    search: z.string().trim().max(200).optional(),

    type: documentTypeSchema.optional(),
  })
  .strict();

// ============================================================================
// DOCUMENT AI ANALYSIS
// ============================================================================

export const documentAnalysisFactCategorySchema = z.enum([
  "identity",
  "contact",
  "experience",
  "skill",
  "project",
  "education",
  "certification",
  "achievement",
  "preference",
  "other",
]);

export const documentAnalysisFactSchema = z
  .object({
    category: documentAnalysisFactCategorySchema,

    fact: z.string().trim().min(1).max(10_000),

    confidence: z.number().finite().min(0).max(1),

    sourceChunkIds: z.array(z.string().trim().min(1).max(255)).min(1).max(100),
  })
  .strict();

export const documentAnalysisOutputSchema = z
  .object({
    summary: z.string().trim().min(1).max(30_000),

    documentType: documentTypeSchema,

    facts: z.array(documentAnalysisFactSchema).max(500),

    keywords: z.array(z.string().trim().min(1).max(200)).max(200),

    warnings: z.array(z.string().trim().min(1).max(2_000)).max(100).optional(),
  })
  .strict();

export const documentAnalysisSchema = z
  .object({
    analysisId: z.string().uuid(),

    documentId: z.string().uuid(),

    documentType: documentTypeSchema,

    format: documentFormatSchema,

    provider: z.string().trim().min(1).max(100),

    model: z.string().trim().min(1).max(200),

    analyzedAt: z.string().datetime(),

    summary: z.string().trim().min(1).max(30_000),

    facts: z.array(documentAnalysisFactSchema).max(500),

    keywords: z.array(z.string().trim().min(1).max(200)).max(200),

    warnings: z.array(z.string().trim().min(1).max(2_000)).max(100),
  })
  .strict();

// ============================================================================
// INFERRED TYPES
// ============================================================================

export type DocumentTypeInput = z.infer<typeof documentTypeSchema>;

export type DocumentFormatInput = z.infer<typeof documentFormatSchema>;

export type DocumentCreateInput = z.infer<typeof documentCreateSchema>;

export type DocumentReadInput = z.infer<typeof documentReadSchema>;

export type DocumentDeleteInput = z.infer<typeof documentDeleteSchema>;

export type DocumentListInput = z.infer<typeof documentListSchema>;

export type DocumentAnalysisFactCategoryInput = z.infer<
  typeof documentAnalysisFactCategorySchema
>;

export type DocumentAnalysisFactInput = z.infer<
  typeof documentAnalysisFactSchema
>;

export type DocumentAnalysisOutputInput = z.infer<
  typeof documentAnalysisOutputSchema
>;

export type DocumentAnalysisInput = z.infer<typeof documentAnalysisSchema>;
