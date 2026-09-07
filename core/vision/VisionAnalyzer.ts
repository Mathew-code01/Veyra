// core/vision/VisionAnalyzer.ts

import type { OCRResult, OCRService } from "./OCRService";

import type {
  ContentClassification,
  ContentClassifier,
} from "./ContentClassifier";

import type { VisionProvider, VisionResponse } from "./VisionProvider";

import type { ImageCompressor } from "./ImageCompressor";

export interface VisionAnalysisRequest {
  readonly image: Uint8Array;
  readonly mimeType: string;
  readonly question?: string;
  readonly language?: string;
  readonly providerName?: string;
  readonly useOCR?: boolean;
  readonly maxImageBytes?: number;
  readonly signal?: AbortSignal;
}

export interface VisionAnalysisResult {
  readonly ocr?: OCRResult;
  readonly classification: ContentClassification;
  readonly vision?: VisionResponse;
  readonly durationMs: number;
}

export interface VisionAnalyzerOptions {
  readonly ocr?: OCRService;
  readonly classifier: ContentClassifier;
  readonly compressor?: ImageCompressor;
  readonly visionProviders?: readonly VisionProvider[];
  readonly defaultVisionProvider?: string;
}

export class VisionAnalyzer {
  private readonly ocr?: OCRService;
  private readonly classifier: ContentClassifier;
  private readonly compressor?: ImageCompressor;

  private readonly providers = new Map<string, VisionProvider>();

  private defaultProvider?: string;

  public constructor(options: VisionAnalyzerOptions) {
    this.ocr = options.ocr;
    this.classifier = options.classifier;
    this.compressor = options.compressor;

    for (const provider of options.visionProviders ?? []) {
      this.providers.set(provider.name, provider);
    }

    this.defaultProvider =
      options.defaultVisionProvider ?? options.visionProviders?.[0]?.name;
  }

  public async analyze(
    request: VisionAnalysisRequest,
  ): Promise<VisionAnalysisResult> {
    const startedAt = performanceNow();

    this.validate(request);

    let image = request.image;

    if (
      this.compressor &&
      request.maxImageBytes &&
      image.byteLength > request.maxImageBytes
    ) {
      const compressed = await this.compressor.compress(
        {
          data: image,
          mimeType: request.mimeType,
        },
        {
          maxBytes: request.maxImageBytes,
        },
      );

      image = compressed.data;
    }

    let ocr: OCRResult | undefined;

    if (request.useOCR !== false && this.ocr) {
      ocr = await this.ocr.recognize({
        image,
        mimeType: request.mimeType,
        language: request.language,
        signal: request.signal,
      });
    }

    const classification = this.classifier.classify({
      ocrText: ocr?.text,
    });

    let vision: VisionResponse | undefined;

    const provider = this.getProvider(request.providerName);

    if (provider) {
      const prompt = buildVisionPrompt({
        classification,
        ocrText: ocr?.text,
        question: request.question,
      });

      vision = await provider.analyze({
        image: {
          data: image,
          mimeType: request.mimeType,
        },
        prompt,
        detail: "high",
        signal: request.signal,
      });
    }

    return {
      ocr,
      classification,
      vision,
      durationMs: performanceNow() - startedAt,
    };
  }

  public registerProvider(provider: VisionProvider, makeDefault = false): void {
    this.providers.set(provider.name, provider);

    if (makeDefault || !this.defaultProvider) {
      this.defaultProvider = provider.name;
    }
  }

  public unregisterProvider(providerName: string): void {
    this.providers.delete(providerName);

    if (this.defaultProvider === providerName) {
      this.defaultProvider = this.providers.keys().next().value;
    }
  }

  public listProviders(): readonly VisionProvider[] {
    return [...this.providers.values()];
  }

  private getProvider(providerName?: string): VisionProvider | undefined {
    const name = providerName ?? this.defaultProvider;

    if (!name) {
      return undefined;
    }

    const provider = this.providers.get(name);

    if (!provider) {
      throw new Error(`Vision provider "${name}" is not registered.`);
    }

    return provider;
  }

  private validate(request: VisionAnalysisRequest): void {
    if (!request.image.length) {
      throw new Error("Vision image cannot be empty.");
    }

    if (!request.mimeType.startsWith("image/")) {
      throw new Error(`Unsupported vision MIME type "${request.mimeType}".`);
    }

    if (request.maxImageBytes !== undefined && request.maxImageBytes <= 0) {
      throw new Error("maxImageBytes must be positive.");
    }
  }
}

function buildVisionPrompt(input: {
  readonly classification: ContentClassification;
  readonly ocrText?: string;
  readonly question?: string;
}): string {
  const sections = [
    "You are analyzing visual information for an interview preparation application.",
    "",
    `Detected content type: ${input.classification.type}`,
    `Classification confidence: ${input.classification.confidence.toFixed(2)}`,
  ];

  if (input.question) {
    sections.push("", "USER QUESTION:", input.question.trim());
  }

  if (input.ocrText) {
    sections.push("", "OCR TEXT:", input.ocrText);
  }

  sections.push(
    "",
    "Instructions:",
    "- Identify the important information visible in the image.",
    "- Do not invent information that is not supported by the image.",
    "- If the image contains a coding problem, explain the requirements and useful solution direction.",
    "- If it contains an architecture diagram, explain components, data flow, scalability and trade-offs.",
    "- If it contains a document, extract the important information relevant to the question.",
    "- If information is unreadable, explicitly say so.",
    "- Keep the response concise and useful for live interview guidance.",
  );

  return sections.join("\n");
}

function performanceNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}