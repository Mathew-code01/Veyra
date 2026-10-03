// ============================================================================
// FILE: core/vision/adapters/VisionContextIndexer.ts
//
// PURPOSE:
// Adapter connecting the Vision subsystem to the generic Context subsystem.
//
// ARCHITECTURE:
//
//     VisionAnalyzer
//          │
//          ▼
//     VisionAnalysisResult
//          │
//          ▼
//     VisionContextIndexer
//          │
//          ▼
//     ContextInput
//          │
//          ▼
//     ContextManager.index()
//          │
//          ├── ContextParser
//          ├── Chunker
//          ├── EmbeddingService
//          └── ContextStore
//
// IMPORTANT:
//
// This adapter is intentionally located inside core/vision because Vision is
// the source domain publishing information into Context.
//
// core/context MUST NOT import this adapter.
//
// DEPENDENCY DIRECTION:
//
//     core/vision ─────────► core/context
//
// NOT:
//
//     core/context ────────► core/vision
//
// Vision remains responsible for answering:
//
//     "What is visible?"
//
// Context remains responsible for answering:
//
//     "What information should Veyra know right now?"
//
// The adapter translates the first into the second without moving Vision
// implementation logic into Context.
// ============================================================================

import type { ContextIndexOptions } from "../../context/ContextManager";

import type { ContextIndexResult } from "../../context/ContextManager";

import type { ContextManager } from "../../context/ContextManager";

import type { ContextContentType } from "../../context/contracts/ContextTypes";

import type {
  VisionAnalysisResult,
  VisionContentType,
} from "../contracts/VisionTypes";

// ============================================================================
// OPTIONS
// ============================================================================

export interface VisionContextIndexOptions extends ContextIndexOptions {
  /**
   * Optional Context name.
   *
   * When omitted, a deterministic name is generated from the Vision result.
   */
  readonly name?: string;
}

// ============================================================================
// INDEXER
// ============================================================================

/**
 * Converts canonical Vision analysis results into generic Context items.
 *
 * This class deliberately contains no Vision processing logic.
 *
 * Vision processing has already completed before this adapter is called.
 */
export class VisionContextIndexer {
  private readonly contextManager: ContextManager;

  public constructor(contextManager: ContextManager) {
    if (!contextManager) {
      throw new Error("VisionContextIndexer requires a ContextManager.");
    }

    this.contextManager = contextManager;
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Publish a completed Vision analysis into Context.
   *
   * The ContextManager receives a generic ContextInput.
   *
   * Context then performs:
   *
   *     parsing
   *       ↓
   *     chunking
   *       ↓
   *     embeddings
   *       ↓
   *     vector storage
   */
  public async index(
    result: VisionAnalysisResult,
    options: VisionContextIndexOptions = {},
  ): Promise<ContextIndexResult> {
    this.validateResult(result);

    this.throwIfAborted(options.signal);

    const input = this.toContextInput(result, options);

    this.throwIfAborted(options.signal);

    return this.contextManager.index(input, {
      signal: options.signal,
    });
  }

  // ==========================================================================
  // CONTEXT TRANSLATION
  // ==========================================================================

  /**
   * Translate the canonical Vision result into the generic Context contract.
   *
   * IMPORTANT:
   *
   * The structured Vision result is preserved inside metadata.
   *
   * Therefore Context retrieval can use the textual projection while the
   * complete Vision analysis remains available for downstream consumers.
   */
  public toContextInput(
    result: VisionAnalysisResult,
    options: VisionContextIndexOptions = {},
  ): {
    readonly id: string;
    readonly name: string;
    readonly contentType: ContextContentType;
    readonly source: {
      readonly type: "vision";
      readonly id: string;
      readonly name: string;
      readonly metadata: Readonly<Record<string, unknown>>;
    };
    readonly text: string;
    readonly metadata: Readonly<Record<string, unknown>>;
  } {
    this.validateResult(result);

    const name = options.name?.trim() || createContextName(result);

    const contentType = mapVisionContentType(result.classification.type);

    const sourceMetadata: Readonly<Record<string, unknown>> = {
      analysisId: result.analysisId,

      requestId: result.requestId,

      visionSource: result.source,

      provider: result.provider,

      timing: result.timing,
    };

    const metadata: Readonly<Record<string, unknown>> = {
      vision: {
        analysisId: result.analysisId,

        requestId: result.requestId,

        summary: result.summary,

        classification: result.classification,

        ocr: result.ocr,

        observations: result.observations,

        objects: result.objects,

        textBlocks: result.textBlocks,

        provider: result.provider,

        timing: result.timing,

        source: result.source,

        metadata: result.metadata,
      },

      visionAnalysisId: result.analysisId,

      visionRequestId: result.requestId,

      visionContentType: result.classification.type,

      visionConfidence: result.classification.confidence,

      visionProvider: result.provider?.providerName,

      visionModel: result.provider?.modelName,

      visionExecutionTarget: result.provider?.executionTarget,

      ...result.metadata,
    };

    return {
      id: `vision:${result.analysisId}`,

      name,

      contentType,

      source: {
        type: "vision",

        id: result.analysisId,

        name,

        metadata: sourceMetadata,
      },

      text: buildContextText(result),

      metadata,
    };
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  private validateResult(result: VisionAnalysisResult): void {
    if (!result) {
      throw new Error("Vision analysis result is required.");
    }

    if (typeof result.analysisId !== "string" || !result.analysisId.trim()) {
      throw new Error(
        "Vision analysis result must have a non-empty analysisId.",
      );
    }

    if (typeof result.requestId !== "string" || !result.requestId.trim()) {
      throw new Error(
        `Vision analysis "${result.analysisId}" must have a requestId.`,
      );
    }

    if (!result.summary) {
      throw new Error(
        `Vision analysis "${result.analysisId}" must have a summary.`,
      );
    }

    if (
      typeof result.summary.description !== "string" ||
      !result.summary.description.trim()
    ) {
      throw new Error(
        `Vision analysis "${result.analysisId}" must have a summary description.`,
      );
    }

    if (!result.classification) {
      throw new Error(
        `Vision analysis "${result.analysisId}" must have a classification.`,
      );
    }

    if (
      typeof result.classification.type !== "string" ||
      !result.classification.type.trim()
    ) {
      throw new Error(
        `Vision analysis "${result.analysisId}" must have a classification type.`,
      );
    }

    if (
      !Number.isFinite(result.classification.confidence) ||
      result.classification.confidence < 0 ||
      result.classification.confidence > 1
    ) {
      throw new Error(
        `Vision analysis "${result.analysisId}" has an invalid classification confidence.`,
      );
    }

    if (!Array.isArray(result.observations)) {
      throw new Error(
        `Vision analysis "${result.analysisId}" must contain observations.`,
      );
    }

    if (!Array.isArray(result.objects)) {
      throw new Error(
        `Vision analysis "${result.analysisId}" must contain objects.`,
      );
    }

    if (!Array.isArray(result.textBlocks)) {
      throw new Error(
        `Vision analysis "${result.analysisId}" must contain text blocks.`,
      );
    }

    if (!result.metadata || typeof result.metadata !== "object") {
      throw new Error(
        `Vision analysis "${result.analysisId}" must contain metadata.`,
      );
    }
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
      : new Error("Vision-to-Context indexing was cancelled.");
  }
}

// ============================================================================
// TEXT PROJECTION
// ============================================================================

/**
 * Build the searchable textual representation of a Vision analysis.
 *
 * Context's embedding layer works with text.
 *
 * We therefore intentionally expose the important semantic information from
 * Vision as text while retaining the complete structured result in metadata.
 */
function buildContextText(result: VisionAnalysisResult): string {
  const sections: string[] = [];

  sections.push(
    `Visual analysis summary:\n${result.summary.description.trim()}`,
  );

  sections.push(`Visual content type:\n${result.classification.type}`);

  sections.push(
    `Visual classification confidence:\n${formatConfidence(
      result.classification.confidence,
    )}`,
  );

  if (result.classification.signals.length > 0) {
    sections.push(
      `Classification signals:\n${result.classification.signals.join("\n")}`,
    );
  }

  if (result.ocr?.text?.trim()) {
    sections.push(`Visible text (OCR):\n${result.ocr.text.trim()}`);
  }

  if (result.textBlocks.length > 0) {
    const textBlocks = result.textBlocks
      .map((block) => block.text.trim())
      .filter(Boolean);

    if (textBlocks.length > 0) {
      sections.push(`Detected text blocks:\n${textBlocks.join("\n")}`);
    }
  }

  if (result.observations.length > 0) {
    const observations = result.observations
      .map((observation) => {
        const confidence =
          observation.confidence !== undefined
            ? ` (${formatConfidence(observation.confidence)} confidence)`
            : "";

        return `- [${observation.type}] ${observation.description}${confidence}`;
      })
      .filter(Boolean);

    if (observations.length > 0) {
      sections.push(`Visual observations:\n${observations.join("\n")}`);
    }
  }

  if (result.objects.length > 0) {
    const objects = result.objects
      .map((object) => {
        const confidence =
          object.confidence !== undefined
            ? ` (${formatConfidence(object.confidence)} confidence)`
            : "";

        return `- ${object.label}${confidence}`;
      })
      .filter(Boolean);

    if (objects.length > 0) {
      sections.push(`Detected objects:\n${objects.join("\n")}`);
    }
  }

  if (result.provider) {
    const providerParts = [
      result.provider.providerName,
      result.provider.modelName,
      result.provider.executionTarget,
    ].filter(Boolean);

    if (providerParts.length > 0) {
      sections.push(`Vision execution:\n${providerParts.join(" / ")}`);
    }
  }

  return sections.join("\n\n").trim();
}

// ============================================================================
// CONTENT TYPE MAPPING
// ============================================================================

/**
 * Map Vision's visual classification vocabulary to Context's generic
 * vocabulary.
 *
 * Context deliberately does not duplicate every Vision-specific content type.
 *
 * The original Vision classification remains available through metadata:
 *
 *     metadata.visionContentType
 *
 * and the complete structured result remains available under:
 *
 *     metadata.vision
 */
function mapVisionContentType(type: VisionContentType): ContextContentType {
  switch (type) {
    case "text":
      return "visual-text";

    case "object":
    case "scene":
      return "visual-object";

    case "unknown":
      return "generic";

    case "code":
    case "document":
    case "diagram":
    case "chart":
    case "table":
    case "screenshot":
    case "webpage":
    case "terminal":
    case "whiteboard":
    case "presentation":
    case "form":
    case "resume":
    case "job_description":
    case "question":
    case "mixed":
      return "visual-observation";

    default:
      return "visual-observation";
  }
}

// ============================================================================
// NAME
// ============================================================================

function createContextName(result: VisionAnalysisResult): string {
  const type = result.classification.type.replace(/_/g, " ").trim();

  if (type) {
    return `Vision analysis — ${type}`;
  }

  return `Vision analysis — ${result.analysisId}`;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}
