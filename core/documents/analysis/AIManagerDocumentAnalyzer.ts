// ============================================================================
// FILE: core/documents/analysis/AIManagerDocumentAnalyzer.ts
//
// PURPOSE:
// Connects the document semantic-analysis subsystem to core/ai/AIManager.
//
// ARCHITECTURE:
//
// ProcessedDocument
//       ↓
// AIManagerDocumentAnalyzer
//       ↓
// AIManager.generate(providerName, request)
//       ↓
// registered AI provider
//       ↓
// AI response
//       ↓
// validated DocumentAnalysisOutput
//       ↓
// DocumentAnalysis
//
// IMPORTANT:
//
// This class does NOT:
// - parse files
// - normalize files
// - store documents
// - manage candidates
// - manage context
// - select cloud providers
// - perform routing
//
// Provider selection remains explicit.
// Routing belongs to the higher AI orchestration layer.
// ============================================================================

import { randomUUID } from "node:crypto";

import type { AIRequest } from "../../../shared/types/ai";

import { documentAnalysisOutputSchema } from "../../../shared/validation/documentSchemas";

import type {
  DocumentAnalysis,
  DocumentAnalysisOutput,
} from "../../../shared/types/documents";

import type {
  DocumentChunk,
  DocumentType as CoreDocumentType,
  ProcessedDocument,
} from "../DocumentTypes";

import { AIManager } from "../../ai/AIManager";

import type {
  DocumentAIAnalyzer,
  DocumentAIAnalyzerOptions,
} from "./DocumentAIAnalyzer";

// ============================================================================
// INTERNAL TYPES
// ============================================================================

interface AnalysisInputChunk {
  readonly sourceChunkId: string;

  readonly text: string;
}

interface AnalysisBatch {
  readonly chunks: readonly AnalysisInputChunk[];

  readonly characterCount: number;
}

interface AIAnalysisResult {
  readonly output: DocumentAnalysisOutput;

  readonly provider: string;

  readonly model: string;
}

// ============================================================================
// DEFAULTS
// ============================================================================

const DEFAULT_BATCH_MAX_CHARACTERS = 40_000;

const DEFAULT_MAX_TOKENS = 4_000;

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export class AIManagerDocumentAnalyzer implements DocumentAIAnalyzer {
  private readonly aiManager: AIManager;

  private readonly defaultBatchMaxCharacters: number;

  private readonly defaultMaxTokens: number;

  public constructor(
    aiManager: AIManager,
    options: {
      readonly defaultBatchMaxCharacters?: number;

      readonly defaultMaxTokens?: number;
    } = {},
  ) {
    if (!aiManager) {
      throw new Error("AIManager is required by AIManagerDocumentAnalyzer.");
    }

    this.aiManager = aiManager;

    this.defaultBatchMaxCharacters =
      options.defaultBatchMaxCharacters ?? DEFAULT_BATCH_MAX_CHARACTERS;

    this.defaultMaxTokens = options.defaultMaxTokens ?? DEFAULT_MAX_TOKENS;
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  public async analyze(
    document: ProcessedDocument,
    options: DocumentAIAnalyzerOptions,
  ): Promise<DocumentAnalysis> {
    if (!document) {
      throw new Error("A processed document is required for AI analysis.");
    }

    if (!options) {
      throw new Error("Document AI analysis options are required.");
    }

    const providerName = options.providerName.trim();

    if (!providerName) {
      throw new Error("A document AI provider is required.");
    }

    this.throwIfAborted(options.signal);

    const batchMaxCharacters =
      options.batchMaxCharacters ?? this.defaultBatchMaxCharacters;

    if (!Number.isInteger(batchMaxCharacters) || batchMaxCharacters <= 0) {
      throw new Error("batchMaxCharacters must be a positive integer.");
    }

    const maxTokens = options.maxTokens ?? this.defaultMaxTokens;

    if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
      throw new Error("maxTokens must be a positive integer.");
    }

    const batches = this.createBatches(document, batchMaxCharacters);

    if (batches.length === 0) {
      throw new Error(
        `Document "${document.identity.id}" contains no analyzable text.`,
      );
    }

    const partialResults: AIAnalysisResult[] = [];

    for (const batch of batches) {
      this.throwIfAborted(options.signal);

      const result = await this.analyzeBatch(document, batch, {
        providerName,
        model: options.model,
        maxTokens,
        signal: options.signal,
      });

      partialResults.push(result);
    }

    this.throwIfAborted(options.signal);

    let finalResult: AIAnalysisResult;

    if (partialResults.length === 1) {
      finalResult = partialResults[0];
    } else {
      finalResult = await this.consolidateResults(document, partialResults, {
        providerName,
        model: options.model,
        maxTokens,
        signal: options.signal,
      });
    }

    this.throwIfAborted(options.signal);

    const format = toSharedDocumentFormat(document.type);

    const analysis: DocumentAnalysis = {
      analysisId: randomUUID(),

      documentId: document.identity.id,

      documentType: finalResult.output.documentType,

      format,

      provider: finalResult.provider,

      model: finalResult.model,

      analyzedAt: new Date().toISOString(),

      summary: finalResult.output.summary,

      facts: finalResult.output.facts,

      keywords: finalResult.output.keywords,

      warnings: finalResult.output.warnings ?? [],
    };

    return analysis;
  }

  // ==========================================================================
  // BATCH ANALYSIS
  // ==========================================================================

  private async analyzeBatch(
    document: ProcessedDocument,
    batch: AnalysisBatch,
    options: {
      readonly providerName: string;

      readonly model?: string;

      readonly maxTokens: number;

      readonly signal?: AbortSignal;
    },
  ): Promise<AIAnalysisResult> {
    const sourceText = batch.chunks
      .map((chunk) => `[SOURCE CHUNK: ${chunk.sourceChunkId}]\n${chunk.text}`)
      .join("\n\n");

    const request: AIRequest = {
      requestId: randomUUID(),

      provider: options.providerName,

      model: options.model,

      mode: "general",

      messages: [
        {
          role: "system",

          content: DOCUMENT_ANALYSIS_SYSTEM_PROMPT,
        },

        {
          role: "user",

          content: this.buildBatchPrompt(document, sourceText, batch),
        },
      ],

      options: {
        temperature: 0,

        maxTokens: options.maxTokens,

        responseFormat: "json",

        metadata: {
          subsystem: "documents",

          operation: "document-analysis",

          documentId: document.identity.id,
        },
      },

      stream: false,

      metadata: {
        subsystem: "documents",

        operation: "document-analysis",

        documentId: document.identity.id,
      },

      signal: options.signal,
    };

    const response = await this.aiManager.generate(
      options.providerName,
      request,
    );

    this.throwIfAborted(options.signal);

    if (response.type === "embedding") {
      throw new Error(
        `Document analysis provider "${options.providerName}" returned an embedding response instead of text.`,
      );
    }

    const output = this.parseAnalysisOutput(response.text);

    return {
      output,

      provider: response.metadata.provider,

      model: response.metadata.model,
    };
  }

  // ==========================================================================
  // CONSOLIDATION
  // ==========================================================================

  private async consolidateResults(
    document: ProcessedDocument,
    partialResults: readonly AIAnalysisResult[],
    options: {
      readonly providerName: string;

      readonly model?: string;

      readonly maxTokens: number;

      readonly signal?: AbortSignal;
    },
  ): Promise<AIAnalysisResult> {
    const partialJson = partialResults.map((result, index) => ({
      batch: index + 1,

      output: result.output,
    }));

    const request: AIRequest = {
      requestId: randomUUID(),

      provider: options.providerName,

      model: options.model,

      mode: "general",

      messages: [
        {
          role: "system",

          content: DOCUMENT_ANALYSIS_CONSOLIDATION_SYSTEM_PROMPT,
        },

        {
          role: "user",

          content: [
            `DOCUMENT ID: ${document.identity.id}`,

            `SOURCE FORMAT: ${document.type}`,

            "",

            "PARTIAL DOCUMENT ANALYSES:",

            JSON.stringify(partialJson, null, 2),
          ].join("\n"),
        },
      ],

      options: {
        temperature: 0,

        maxTokens: options.maxTokens,

        responseFormat: "json",

        metadata: {
          subsystem: "documents",

          operation: "document-analysis-consolidation",

          documentId: document.identity.id,
        },
      },

      stream: false,

      metadata: {
        subsystem: "documents",

        operation: "document-analysis-consolidation",

        documentId: document.identity.id,
      },

      signal: options.signal,
    };

    const response = await this.aiManager.generate(
      options.providerName,
      request,
    );

    this.throwIfAborted(options.signal);

    if (response.type === "embedding") {
      throw new Error(
        `Document analysis consolidation provider "${options.providerName}" returned an embedding response instead of text.`,
      );
    }

    const output = this.parseAnalysisOutput(response.text);

    return {
      output,

      provider: response.metadata.provider,

      model: response.metadata.model,
    };
  }

  // ==========================================================================
  // BATCH CREATION
  // ==========================================================================

  private createBatches(
    document: ProcessedDocument,
    maxCharacters: number,
  ): readonly AnalysisBatch[] {
    const sourceChunks =
      document.chunks.length > 0
        ? document.chunks
        : [
            {
              id: document.identity.id,

              documentId: document.identity.id,

              index: 0,

              text: document.text,

              source: {
                documentId: document.identity.id,
              },
            } satisfies DocumentChunk,
          ];

    const batches: AnalysisBatch[] = [];

    let currentChunks: AnalysisInputChunk[] = [];

    let currentCharacters = 0;

    for (const chunk of sourceChunks) {
      const text = chunk.text.trim();

      if (!text) {
        continue;
      }

      /**
       * A normal document chunk should already be bounded by the
       * document chunker.
       *
       * If one chunk is larger than the AI batch size, we split
       * that chunk for transport while retaining the ORIGINAL
       * chunk ID as provenance.
       */
      const parts =
        text.length > maxCharacters ? splitText(text, maxCharacters) : [text];

      for (const part of parts) {
        if (
          currentChunks.length > 0 &&
          currentCharacters + part.length > maxCharacters
        ) {
          batches.push({
            chunks: currentChunks,

            characterCount: currentCharacters,
          });

          currentChunks = [];

          currentCharacters = 0;
        }

        currentChunks.push({
          sourceChunkId: chunk.id,

          text: part,
        });

        currentCharacters += part.length;
      }
    }

    if (currentChunks.length > 0) {
      batches.push({
        chunks: currentChunks,

        characterCount: currentCharacters,
      });
    }

    return batches;
  }

  // ==========================================================================
  // PROMPT BUILDING
  // ==========================================================================

  private buildBatchPrompt(
    document: ProcessedDocument,
    sourceText: string,
    batch: AnalysisBatch,
  ): string {
    return [
      `DOCUMENT ID: ${document.identity.id}`,

      `DOCUMENT FORMAT: ${document.type}`,

      `BATCH CHARACTER COUNT: ${batch.characterCount}`,

      "",

      "Analyze only the supplied document content.",

      "Do not invent facts.",

      "Every extracted fact MUST reference one or more sourceChunkIds.",

      "",

      "SOURCE CONTENT:",

      sourceText,

      "",

      "Return JSON matching this structure:",

      JSON.stringify(
        {
          summary: "A concise factual summary.",

          documentType: "resume",

          facts: [
            {
              category: "experience",

              fact: "A fact explicitly supported by the document.",

              confidence: 0.95,

              sourceChunkIds: ["source-chunk-id"],
            },
          ],

          keywords: ["keyword"],

          warnings: [],
        },
        null,
        2,
      ),
    ].join("\n");
  }

  // ==========================================================================
  // OUTPUT VALIDATION
  // ==========================================================================

  private parseAnalysisOutput(text: string): DocumentAnalysisOutput {
    const cleaned = cleanJsonResponse(text);

    let parsed: unknown;

    try {
      parsed = JSON.parse(cleaned);
    } catch (error) {
      throw new Error(
        `Document AI analysis returned invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return documentAnalysisOutputSchema.parse(parsed);
  }

  // ==========================================================================
  // CANCELLATION
  // ==========================================================================

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Document AI analysis was cancelled.");
  }
}

// ============================================================================
// PROMPTS
// ============================================================================

const DOCUMENT_ANALYSIS_SYSTEM_PROMPT = `
You are Veyra's document semantic-analysis engine.

Your job is to transform already-parsed document content into structured,
grounded semantic knowledge that downstream systems can use.

The original document is authoritative.

Rules:

1. Extract only information supported by the supplied document.
2. Never invent qualifications, experience, dates, employers, skills,
   education, projects, contact information, or achievements.
3. Every fact MUST contain at least one sourceChunkId.
4. Confidence must reflect the strength of the evidence.
5. Prefer explicit statements over assumptions.
6. Do not infer sensitive personal characteristics unless explicitly required
   by the document-processing task.
7. Return JSON only.
8. Follow the requested schema exactly.
9. Keep the summary factual and grounded.
10. Do not include markdown fences around the JSON.
`.trim();

const DOCUMENT_ANALYSIS_CONSOLIDATION_SYSTEM_PROMPT = `
You are Veyra's document-analysis consolidation engine.

You are receiving semantic analyses generated from different portions of the
same document.

Your job is to produce one consolidated, grounded analysis.

Rules:

1. Do not invent facts.
2. Preserve sourceChunkIds from the partial analyses.
3. Deduplicate equivalent facts.
4. If two pieces of evidence conflict, do not silently choose an invented
   resolution. Preserve the supported information and reduce confidence
   where appropriate.
5. Preserve useful evidence from all document sections.
6. Produce one coherent summary.
7. Classify the document using the supported documentType values.
8. Return JSON only.
9. Follow the requested schema exactly.
`.trim();

// ============================================================================
// HELPERS
// ============================================================================

function cleanJsonResponse(text: string): string {
  const trimmed = text.trim();

  if (trimmed.startsWith("```json")) {
    return trimmed
      .slice("```json".length)
      .replace(/```\s*$/u, "")
      .trim();
  }

  if (trimmed.startsWith("```")) {
    return trimmed
      .slice(3)
      .replace(/```\s*$/u, "")
      .trim();
  }

  return trimmed;
}

function splitText(text: string, maxCharacters: number): readonly string[] {
  const parts: string[] = [];

  let offset = 0;

  while (offset < text.length) {
    const end = Math.min(offset + maxCharacters, text.length);

    let boundary = end;

    if (end < text.length) {
      const whitespace = text.lastIndexOf(" ", end);

      if (whitespace > offset + Math.floor(maxCharacters * 0.5)) {
        boundary = whitespace;
      }
    }

    const part = text.slice(offset, boundary).trim();

    if (part) {
      parts.push(part);
    }

    offset = boundary > offset ? boundary : end;
  }

  return parts;
}

function toSharedDocumentFormat(
  type: CoreDocumentType,
): "pdf" | "docx" | "txt" | "md" | "json" | "unknown" {
  switch (type) {
    case "pdf":
      return "pdf";

    case "docx":
      return "docx";

    case "txt":
      return "txt";

    case "markdown":
      return "md";

    default:
      return "unknown";
  }
}
