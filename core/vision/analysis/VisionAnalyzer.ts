// ============================================================================
// FILE: core/vision/analysis/VisionAnalyzer.ts
//
// PURPOSE:
// Main Vision orchestration engine.
//
// Pipeline:
//
//     Input
//       ↓
//     Validation
//       ↓
//     Image processing/compression
//       ↓
//     OCR
//       ↓
//     Classification
//       ↓
//     Vision provider
//       ↓
//     Canonical VisionResult
//
// IMPORTANT:
// Vision answers:
//
//     "What is visible?"
//
// InterviewEngine / AIManager decides:
//
//     "What should Veyra do with that information?"
//
// Vision never becomes the interview answer engine.
// ============================================================================

import { VisionError } from "../errors/VisionError";

import type { VisionRequest } from "../contracts/VisionRequest";

import type { VisionResult } from "../contracts/VisionResult";

import type { VisionClassification } from "../contracts/VisionTypes";

import { ContentClassifier } from "../classification/ContentClassifier";

import type { OCRService } from "../ocr/OCRService";

import type { OCRResult } from "../ocr/OCRTypes";

import type { ImageProcessor } from "../processing/ImageProcessor";

import type { ImageCompressor } from "../processing/ImageCompressor";

import type {
  VisionProvider,
  VisionResponse,
} from "../providers/VisionProvider";

// ============================================================================
// OPTIONS
// ============================================================================

export interface VisionAnalyzerOptions {
  readonly ocr?: OCRService;

  readonly classifier: ContentClassifier;

  readonly processor?: ImageProcessor;

  readonly compressor?: ImageCompressor;

  readonly visionProviders?: readonly VisionProvider[];

  readonly defaultVisionProvider?: string;
}

// ============================================================================
// ANALYZER
// ============================================================================

export class VisionAnalyzer {
  private readonly ocr?: OCRService;

  private readonly classifier: ContentClassifier;

  private readonly processor?: ImageProcessor;

  private readonly compressor?: ImageCompressor;

  private readonly providers = new Map<string, VisionProvider>();

  private defaultProvider?: string;

  public constructor(options: VisionAnalyzerOptions) {
    if (!options?.classifier) {
      throw VisionError.invalidRequest(
        "VisionAnalyzer requires a ContentClassifier.",
      );
    }

    this.ocr = options.ocr;

    this.classifier = options.classifier;

    this.processor = options.processor;

    this.compressor = options.compressor;

    for (const provider of options.visionProviders ?? []) {
      this.registerProvider(provider, false);
    }

    this.defaultProvider =
      options.defaultVisionProvider ?? options.visionProviders?.[0]?.name;

    if (this.defaultProvider && !this.providers.has(this.defaultProvider)) {
      throw VisionError.providerNotFound(this.defaultProvider, {
        stage: "provider",
      });
    }
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  public async analyze(request: VisionRequest): Promise<VisionResult> {
    this.validateRequest(request);

    throwIfAborted(request.signal);

    const startedAt = performanceNow();

    /*
     * Maintain an explicit internal image invariant.
     *
     * The image passed to OCR/provider adapters is always:
     *
     *     Uint8Array<ArrayBuffer>
     *
     * backed by a standalone ArrayBuffer.
     */
    let image = copyToArrayBufferBackedUint8Array(request.image.data);

    let mimeType = request.image.mimeType.trim().toLowerCase();

    let width = request.image.width;

    let height = request.image.height;

    let preprocessingMs: number | undefined;

    let ocrMs: number | undefined;

    let classificationMs: number | undefined;

    let providerMs: number | undefined;

    try {
      // ========================================================================
      // IMAGE PROCESSING
      // ========================================================================

      const preprocessingStarted = performanceNow();

      if (
        this.processor &&
        (request.maxWidth !== undefined || request.maxHeight !== undefined)
      ) {
        throwIfAborted(request.signal);

        const processed = await this.processor.process(
          {
            data: image,

            mimeType,

            width,

            height,

            signal: request.signal,
          },
          {
            maxWidth: request.maxWidth,

            maxHeight: request.maxHeight,

            quality:
              request.detail === "low"
                ? 0.75
                : request.detail === "medium"
                  ? 0.85
                  : 0.92,

            signal: request.signal,
          },
        );

        throwIfAborted(request.signal);

        image = copyToArrayBufferBackedUint8Array(processed.data);

        mimeType = processed.mimeType.trim().toLowerCase();

        width = processed.width ?? width;

        height = processed.height ?? height;
      }

      // ========================================================================
      // COMPRESSION
      // ========================================================================

      if (
        this.compressor &&
        request.maxImageBytes !== undefined &&
        image.byteLength > request.maxImageBytes
      ) {
        throwIfAborted(request.signal);

        const compressed = await this.compressor.compress(
          {
            data: image,

            mimeType,

            width,

            height,

            signal: request.signal,
          },
          {
            maxBytes: request.maxImageBytes,

            quality:
              request.detail === "low"
                ? 0.75
                : request.detail === "medium"
                  ? 0.85
                  : 0.92,

            signal: request.signal,
          },
        );

        throwIfAborted(request.signal);

        image = copyToArrayBufferBackedUint8Array(compressed.data);

        mimeType = compressed.mimeType.trim().toLowerCase();

        width = compressed.width ?? width;

        height = compressed.height ?? height;
      }

      preprocessingMs = performanceNow() - preprocessingStarted;

      throwIfAborted(request.signal);

      // ========================================================================
      // OCR
      // ========================================================================

      let ocr: OCRResult | undefined;

      if (request.useOCR !== false && this.ocr) {
        const ocrStarted = performanceNow();

        throwIfAborted(request.signal);

        ocr = await this.ocr.recognize({
          image,

          mimeType,

          width,

          height,

          language: request.language,

          signal: request.signal,

          metadata: request.metadata,
        });

        ocrMs = performanceNow() - ocrStarted;
      }

      throwIfAborted(request.signal);

      // ========================================================================
      // CLASSIFICATION
      // ========================================================================

      const classificationStarted = performanceNow();

      const classification = this.classifier.classify({
        ocrText: ocr?.text,

        width,

        height,

        source: request.source?.type,
      });

      classificationMs = performanceNow() - classificationStarted;

      throwIfAborted(request.signal);

      // ========================================================================
      // VISION PROVIDER
      // ========================================================================

      const provider = this.getProvider(request.providerName);

      let vision: VisionResponse | undefined;

      if (provider) {
        const providerStarted = performanceNow();

        throwIfAborted(request.signal);

        vision = await provider.analyze({
          image: {
            data: image,

            mimeType,

            width,

            height,
          },

          question: request.question,

          prompt: buildVisionPrompt({
            classification,

            ocrText: ocr?.text,

            question: request.question,
          }),

          detail: request.detail ?? "high",

          language: request.language,

          modelName: request.modelName,

          signal: request.signal,

          metadata: request.metadata,
        });

        providerMs = performanceNow() - providerStarted;
      }

      throwIfAborted(request.signal);

      // ========================================================================
      // CANONICAL RESULT
      // ========================================================================

      return buildResult({
        request,

        classification,

        ocr,

        vision,

        startedAt,

        preprocessingMs,

        ocrMs,

        classificationMs,

        providerMs,
      });
    } catch (error) {
      if (request.signal?.aborted) {
        throw VisionError.cancelled({
          stage: "pipeline",

          cause: error,
        });
      }

      if (error instanceof VisionError) {
        throw error;
      }

      throw VisionError.fromUnknown(error, "VISION_INTERNAL_ERROR", {
        stage: "pipeline",
      });
    }
  }

  // ==========================================================================
  // PROVIDER MANAGEMENT
  // ==========================================================================

  public registerProvider(provider: VisionProvider, makeDefault = false): void {
    if (!provider) {
      throw VisionError.invalidRequest("Vision provider is required.");
    }

    if (!provider.name?.trim()) {
      throw VisionError.invalidRequest("Vision provider name is required.");
    }

    if (!provider.capabilities?.vision) {
      throw new VisionError(
        "VISION_CONFIGURATION_ERROR",
        `Provider "${provider.name}" does not support vision.`,
        {
          details: {
            stage: "provider",

            providerName: provider.name,
          },
        },
      );
    }

    if (typeof provider.analyze !== "function") {
      throw new VisionError(
        "VISION_CONFIGURATION_ERROR",
        `Provider "${provider.name}" does not implement analyze().`,
        {
          details: {
            stage: "provider",

            providerName: provider.name,
          },
        },
      );
    }

    const name = provider.name.trim();

    this.providers.set(name, provider);

    if (makeDefault || !this.defaultProvider) {
      this.defaultProvider = name;
    }
  }

  public unregisterProvider(providerName: string): void {
    const name = providerName.trim();

    if (!name) {
      return;
    }

    this.providers.delete(name);

    if (this.defaultProvider === name) {
      this.defaultProvider = this.providers.keys().next().value;

      if (this.defaultProvider === undefined) {
        this.defaultProvider = undefined;
      }
    }
  }

  public listProviders(): readonly VisionProvider[] {
    return [...this.providers.values()];
  }

  // ==========================================================================
  // PROVIDER LOOKUP
  // ==========================================================================

  private getProvider(providerName?: string): VisionProvider | undefined {
    const name = providerName?.trim() ?? this.defaultProvider;

    if (!name) {
      return undefined;
    }

    const provider = this.providers.get(name);

    if (!provider) {
      throw VisionError.providerNotFound(name, {
        stage: "provider",
      });
    }

    return provider;
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  private validateRequest(request: VisionRequest): void {
    if (!request) {
      throw VisionError.invalidRequest("Vision request is required.");
    }

    if (!request.image) {
      throw VisionError.invalidRequest("Vision image is required.");
    }

    if (!(request.image.data instanceof Uint8Array)) {
      throw VisionError.invalidImage("Vision image must be a Uint8Array.");
    }

    if (!request.image.data.byteLength) {
      throw VisionError.invalidImage("Vision image cannot be empty.");
    }

    const mimeType = request.image.mimeType?.trim().toLowerCase();

    if (!mimeType) {
      throw VisionError.invalidRequest("Vision image MIME type is required.");
    }

    if (!mimeType.startsWith("image/")) {
      throw VisionError.unsupportedMimeType(mimeType, {
        stage: "validation",
      });
    }

    if (
      request.maxImageBytes !== undefined &&
      (!Number.isSafeInteger(request.maxImageBytes) ||
        request.maxImageBytes <= 0)
    ) {
      throw VisionError.invalidRequest(
        "maxImageBytes must be a positive safe integer.",
      );
    }

    if (
      request.maxWidth !== undefined &&
      (!Number.isSafeInteger(request.maxWidth) || request.maxWidth <= 0)
    ) {
      throw VisionError.invalidRequest(
        "maxWidth must be a positive safe integer.",
      );
    }

    if (
      request.maxHeight !== undefined &&
      (!Number.isSafeInteger(request.maxHeight) || request.maxHeight <= 0)
    ) {
      throw VisionError.invalidRequest(
        "maxHeight must be a positive safe integer.",
      );
    }

    validateDimension(request.image.width, "Vision image width");

    validateDimension(request.image.height, "Vision image height");

    if (request.question !== undefined && request.question.length > 16_000) {
      throw VisionError.invalidRequest(
        "Vision question exceeds the maximum supported length.",
      );
    }

    if (request.language !== undefined && request.language.length > 128) {
      throw VisionError.invalidRequest(
        "Vision language exceeds the maximum supported length.",
      );
    }

    if (request.modelName !== undefined && request.modelName.length > 256) {
      throw VisionError.invalidRequest(
        "Vision model name exceeds the maximum supported length.",
      );
    }

    if (
      request.providerName !== undefined &&
      request.providerName.length > 256
    ) {
      throw VisionError.invalidRequest(
        "Vision provider name exceeds the maximum supported length.",
      );
    }
  }
}

// ============================================================================
// RESULT
// ============================================================================

function buildResult(input: {
  readonly request: VisionRequest;

  readonly classification: VisionClassification;

  readonly ocr?: OCRResult;

  readonly vision?: VisionResponse;

  readonly startedAt: number;

  readonly preprocessingMs?: number;

  readonly ocrMs?: number;

  readonly classificationMs?: number;

  readonly providerMs?: number;
}): VisionResult {
  const description =
    input.vision?.description?.trim() ||
    createFallbackDescription(input.classification, input.ocr);

  const confidence = clamp01(
    input.vision?.confidence ?? input.classification.confidence,
  );

  return Object.freeze({
    analysisId: createAnalysisId(),

    summary: Object.freeze({
      description,

      confidence,
    }),

    classification: Object.freeze({
      type: input.classification.type,

      confidence: clamp01(input.classification.confidence),

      signals: Object.freeze([...input.classification.signals]),

      ...(input.classification.scores
        ? {
            scores: Object.freeze({
              ...input.classification.scores,
            }),
          }
        : {}),
    }),

    ocr: input.ocr,

    observations: Object.freeze([...(input.vision?.observations ?? [])]),

    objects: Object.freeze([...(input.vision?.objects ?? [])]),

    textBlocks: Object.freeze([...(input.vision?.textBlocks ?? [])]),

    provider: input.vision?.provider,

    timing: Object.freeze({
      totalMs: Math.max(0, performanceNow() - input.startedAt),

      preprocessingMs: normalizeDuration(input.preprocessingMs),

      ocrMs: normalizeDuration(input.ocrMs),

      classificationMs: normalizeDuration(input.classificationMs),

      providerMs: normalizeDuration(input.providerMs),
    }),

    source: input.request.source,

    metadata: Object.freeze({
      ...(input.request.metadata ?? {}),

      ...(input.vision?.metadata ?? {}),
    }),
  });
}

// ============================================================================
// PROMPT
// ============================================================================

function buildVisionPrompt(input: {
  readonly classification: VisionClassification;

  readonly ocrText?: string;

  readonly question?: string;
}): string {
  const sections: string[] = [
    "You are the visual understanding component of a general interview copilot.",

    "",

    "Your responsibility is to determine what is visibly present and explain the visual information accurately.",

    "",

    `Detected visual type: ${input.classification.type}`,

    `Classification confidence: ${input.classification.confidence.toFixed(2)}`,
  ];

  if (input.question?.trim()) {
    sections.push("", "USER QUESTION:", input.question.trim());
  }

  if (input.ocrText?.trim()) {
    sections.push("", "OCR TEXT:", input.ocrText.trim());
  }

  sections.push(
    "",
    "RULES:",

    "1. Describe only information supported by the image.",

    "2. Do not invent unreadable text, values, labels, people, objects, or relationships.",

    "3. Explicitly identify uncertainty when visual information is unclear.",

    "4. Preserve important numbers, labels, names, relationships, and visible structure.",

    "5. For coding material, identify the problem, requirements, constraints, and relevant code structure.",

    "6. For architecture diagrams, identify components, connections, data flow, scaling elements, and visible trade-offs.",

    "7. For charts, identify axes, trends, values, comparisons, and anomalies that are actually visible.",

    "8. For tables, preserve important headers, rows, values, and relationships.",

    "9. For resumes and job descriptions, identify relevant visible sections and requirements.",

    "10. For webpages, forms, terminals, presentations, and documents, explain the important visible information.",

    "11. For whiteboards and diagrams, preserve visible relationships and structure without inventing missing connections.",

    "12. For general scenes or objects, describe only clearly visible elements relevant to the request.",

    "13. Keep the result concise enough for live interview assistance.",
  );

  return sections.join("\n");
}

// ============================================================================
// FALLBACK
// ============================================================================

function createFallbackDescription(
  classification: VisionClassification,

  ocr: OCRResult | undefined,
): string {
  if (ocr?.text?.trim()) {
    return `The image appears to contain ${classification.type} content with visible text.`;
  }

  return `The image appears to contain ${classification.type} visual content.`;
}

// ============================================================================
// CANCELLATION
// ============================================================================

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw VisionError.cancelled({
      stage: "pipeline",
    });
  }
}

// ============================================================================
// BYTE NORMALIZATION
// ============================================================================

function copyToArrayBufferBackedUint8Array(
  data: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(data.byteLength);

  const result = new Uint8Array(buffer);

  result.set(data);

  return result;
}

// ============================================================================
// HELPERS
// ============================================================================

function validateDimension(value: number | undefined, name: string): void {
  if (value === undefined) {
    return;
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw VisionError.invalidDimensions(
      `${name} must be a positive safe integer.`,
      {
        stage: "validation",
      },
    );
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function normalizeDuration(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return value;
}

function createAnalysisId(): string {
  const timestamp = Date.now().toString(36);

  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 14);

  return `vision-${timestamp}-${random}`;
}

function performanceNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
