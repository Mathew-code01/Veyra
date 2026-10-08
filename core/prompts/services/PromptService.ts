// ============================================================================
// FILE: core/prompts/services/PromptService.ts
//
// PURPOSE:
// Public application service for the Veyra Prompt subsystem.
//
// RESPONSIBILITY:
//
//     InterviewAnalysis
//            │
//            ├── candidate evidence
//            │
//            └── context evidence
//                     │
//                     ▼
//                PromptService
//                     │
//                     ▼
//              PromptInstructionSet
//                     │
//                     ▼
//                  AIRequest
//
// PromptService answers:
//
//     "How should this already-understood task be instructed to AI?"
//
// PromptService does NOT answer:
//
//     "What interview task is happening?"
//     "What candidate facts exist?"
//     "What context should be retrieved?"
//     "Which provider should run it?"
//     "Which model should run it?"
//
// Those responsibilities belong elsewhere.
//
// IMPORTANT:
//
// PromptService does not call AIManager.
//
// It prepares the canonical shared AIRequest contract that is then consumed
// by the core/ai execution layer.
//
// ARCHITECTURE:
//
// Interview
//    │
//    ▼
// InterviewIntelligence
//    │
//    ├── CandidateService
//    ├── ContextManager
//    │
//    ▼
// PromptService
//    │
//    ├── PromptRegistry
//    ├── InterviewPromptBuilder
//    ├── SystemPromptBuilder
//    └── VisionPromptBuilder
//    │
//    ▼
// PromptInstructionSet
//    │
//    ▼
// shared/types/ai.ts :: AIRequest
//    │
//    ▼
// core/ai
//    │
//    ├── AIManager
//    ├── AIRouter
//    ├── LocalModelProvider
//    └── CloudAIProvider
// ============================================================================

import type { AIRequest, AIRequestMode } from "../../../shared/types/ai";

import type { InterviewAnalysis } from "../../../shared/types/interviews";

import type { InterviewType } from "../../../shared/constants/interviewTypes";

import type {
  PromptBuildInput,
  PromptAIRequestOptions,
  PromptBuildResult,
  PromptInstructionSet,
} from "../contracts/PromptTypes";

import { PromptRegistry } from "../registry/PromptRegistry";

import { PromptNormalizer } from "../normalization/PromptNormalizer";

import {
  InterviewPromptBuilder,
  type InterviewPromptBuilderOptions,
} from "../builders/InterviewPromptBuilder";

import { SystemPromptBuilder } from "../builders/SystemPromptBuilder";

import { VisionPromptBuilder } from "../builders/VisionPromptBuilder";

import { INTERVIEW_PROMPT_TEMPLATES } from "../templates/interview";

import { DEFAULT_SYSTEM_TEMPLATE } from "../templates/system/default";

import { DEFAULT_VISION_TEMPLATE } from "../templates/vision/default";

// ============================================================================
// OPTIONS
// ============================================================================

export interface PromptServiceOptions {
  /**
   * Shared prompt registry.
   */
  readonly registry?: PromptRegistry;

  /**
   * Shared prompt normalizer.
   */
  readonly normalizer?: PromptNormalizer;

  /**
   * Optional custom interview builder.
   */
  readonly interviewBuilder?: InterviewPromptBuilder;

  /**
   * System prompt builder.
   */
  readonly systemBuilder?: SystemPromptBuilder;

  /**
   * Vision prompt builder.
   */
  readonly visionBuilder?: VisionPromptBuilder;

  /**
   * Whether default templates should be registered automatically.
   *
   * Defaults to true.
   */
  readonly registerDefaults?: boolean;
}

// ============================================================================
// SERVICE
// ============================================================================

export class PromptService {
  private readonly registry: PromptRegistry;

  private readonly normalizer: PromptNormalizer;

  private readonly interviewBuilder: InterviewPromptBuilder;

  private readonly systemBuilder: SystemPromptBuilder;

  private readonly visionBuilder: VisionPromptBuilder;

  // ========================================================================
  // CONSTRUCTOR
  // ========================================================================

  public constructor(options: PromptServiceOptions = {}) {
    this.registry = options.registry ?? new PromptRegistry();

    this.normalizer = options.normalizer ?? new PromptNormalizer();

    this.interviewBuilder =
      options.interviewBuilder ??
      new InterviewPromptBuilder({
        registry: this.registry,

        normalizer: this.normalizer,
      });

    this.systemBuilder = options.systemBuilder ?? new SystemPromptBuilder();

    this.visionBuilder = options.visionBuilder ?? new VisionPromptBuilder();

    if (options.registerDefaults ?? true) {
      this.registerDefaultTemplates();
    }
  }

  // ========================================================================
  // TEMPLATE REGISTRATION
  // ========================================================================

  public registerTemplate(
    template: Parameters<PromptRegistry["register"]>[0],

    replaceExisting = true,
  ): void {
    this.registry.register(template, replaceExisting);
  }

  public getRegistry(): PromptRegistry {
    return this.registry;
  }

  // ========================================================================
  // BUILD INTERVIEW PROMPT
  // ========================================================================

  /**
   * Build the prompt instructions for an already-analyzed interview.
   *
   * This returns PromptInstructionSet.
   *
   * It does NOT create an AI provider call.
   */
  public buildInterviewPrompt(input: PromptBuildInput): PromptInstructionSet {
    this.validateInput(input);

    if (!input.analysis) {
      throw new Error(
        "Interview prompt construction requires InterviewAnalysis.",
      );
    }

    this.throwIfAborted(input.signal);

    const prompt = this.interviewBuilder.build(input);

    return this.normalizer.normalize(prompt);
  }

  // ========================================================================
  // BUILD SYSTEM PROMPT
  // ========================================================================

  public buildSystemPrompt(input: PromptBuildInput = {}): PromptInstructionSet {
    this.validateInput(input);

    this.throwIfAborted(input.signal);

    return this.normalizer.normalize(this.systemBuilder.build(input));
  }

  // ========================================================================
  // BUILD VISION PROMPT
  // ========================================================================

  public buildVisionPrompt(input: PromptBuildInput): PromptInstructionSet {
    this.validateInput(input);

    this.throwIfAborted(input.signal);

    return this.normalizer.normalize(this.visionBuilder.build(input));
  }

  // ========================================================================
  // BUILD COMPLETE INTERVIEW PROMPT
  // ========================================================================

  /**
   * Build the complete interview PromptInstructionSet.
   *
   * Composition:
   *
   *     system instructions
   *            +
   *     interview instructions
   *            +
   *     candidate grounding
   *            +
   *     context grounding
   *            +
   *     safety instructions
   *            ↓
   *     PromptInstructionSet
   */
  public buildInterview(input: PromptBuildInput): PromptInstructionSet {
    this.validateInput(input);

    if (!input.analysis) {
      throw new Error("InterviewAnalysis is required.");
    }

    this.throwIfAborted(input.signal);

    const system = this.buildSystemPrompt(input);

    this.throwIfAborted(input.signal);

    const interview = this.buildInterviewPrompt(input);

    this.throwIfAborted(input.signal);

    const sections = [...system.sections, ...interview.sections];

    const normalizedSections = this.normalizer.normalizeSections(sections);

    const messages = this.normalizer.toMessages(normalizedSections);

    return Object.freeze({
      ...interview,

      sections: normalizedSections,

      messages,

      family: "interview",

      kind: input.analysis.classification.type,

      source: "template",

      grounded: interview.grounded || system.grounded,
    });
  }

  // ========================================================================
  // PROMPT → AI REQUEST
  // ========================================================================

  /**
   * Convert PromptInstructionSet into the canonical shared AIRequest.
   *
   * IMPORTANT:
   *
   * This is the boundary between:
   *
   *     core/prompts
   *
   * and:
   *
   *     core/ai
   *
   * PromptService creates the request.
   *
   * core/ai executes it.
   *
   * PromptService does NOT call AIManager.
   */
  public toAIRequest(
    prompt: PromptInstructionSet,

    options: PromptAIRequestOptions,
  ): AIRequest {
    if (!prompt) {
      throw new Error("PromptInstructionSet is required.");
    }

    if (!options?.requestId) {
      throw new Error("A requestId is required to construct AIRequest.");
    }

    this.throwIfAborted(options.signal);

    const generation = prompt.generation;

    const requestOptions =
      generation || prompt.metadata
        ? Object.freeze({
            ...(generation
              ? {
                  temperature: generation.temperature,

                  maxTokens: generation.maxTokens,

                  topP: generation.topP,

                  topK: generation.topK,

                  

                  responseFormat: generation.responseFormat,
                }
              : {}),

            ...(prompt.metadata
              ? {
                  metadata: prompt.metadata,
                }
              : {}),
          })
        : undefined;

    const request: AIRequest = {
      requestId: options.requestId,

      provider: options.provider,

      model: options.model,

      mode: prompt.mode,

      messages: Object.freeze([...prompt.messages]),

      options: requestOptions,

      signal: options.signal,

      timeoutMs: options.timeoutMs,

      stream: options.stream,

      metadata: Object.freeze({
        ...this.toStringMetadata(prompt.metadata),

        promptFamily: prompt.family,

        promptKind: prompt.kind,

        promptSource: prompt.source,

        grounded: String(prompt.grounded),

        ...(prompt.candidateId
          ? {
              candidateId: prompt.candidateId,
            }
          : {}),

        ...(prompt.contextIds && prompt.contextIds.length > 0
          ? {
              contextIds: prompt.contextIds.join(","),
            }
          : {}),
      }),
    };

    return Object.freeze(request);
  }

  // ========================================================================
  // BUILD + CONVERT
  // ========================================================================

  /**
   * Convenience operation.
   *
   * Produces:
   *
   *     PromptInstructionSet
   *             +
   *          AIRequest
   *
   * It still does NOT execute AI.
   */
  public buildInterviewRequest(
    input: PromptBuildInput,

    options: PromptAIRequestOptions,
  ): PromptBuildResult {
    this.throwIfAborted(input?.signal);

    const prompt = this.buildInterview(input);

    this.throwIfAborted(options?.signal);

    const request = this.toAIRequest(prompt, options);

    return Object.freeze({
      prompt,

      request,
    });
  }

  // ========================================================================
  // INTERVIEW TYPE → AI MODE
  // ========================================================================

  /**
   * Map domain InterviewType values to shared AIRequest modes.
   *
   * IMPORTANT:
   *
   * Interview uses:
   *
   *     system_design
   *
   * Shared AI uses:
   *
   *     system-design
   *
   * The mapping belongs here rather than duplicating or changing either
   * domain's canonical type.
   */
  public getInterviewMode(type: InterviewType): AIRequestMode {
    switch (type) {
      case "system_design":
        return "system-design";

      case "behavioral":
      case "technical":
      case "coding":
      case "product":
      case "case":
      case "communication":
      case "general":
        return type;

      case "experience":
      case "motivation":
      case "situational":
      default:
        return "general";
    }
  }

  // ========================================================================
  // VALIDATION
  // ========================================================================

  private validateInput(input: PromptBuildInput): void {
    if (!input) {
      throw new Error("Prompt build input is required.");
    }

    if (input.question !== undefined && typeof input.question !== "string") {
      throw new Error("Prompt question must be a string.");
    }

    if (
      input.instruction !== undefined &&
      typeof input.instruction !== "string"
    ) {
      throw new Error("Prompt instruction must be a string.");
    }

    if (
      input.responseStyle !== undefined &&
      !["concise", "balanced", "detailed", "interview-ready"].includes(
        input.responseStyle,
      )
    ) {
      throw new Error(
        `Unsupported prompt response style: ${String(input.responseStyle)}`,
      );
    }
  }

  // ========================================================================
  // METADATA
  // ========================================================================

  /**
   * Prompt metadata may contain values suitable for AIRequestOptions.
   *
   * The outer AIRequest metadata contract is intentionally string-only because
   * it is the transport-safe metadata representation.
   */
  private toStringMetadata(
    metadata: Readonly<Record<string, string | number | boolean>> | undefined,
  ): Readonly<Record<string, string>> {
    if (!metadata) {
      return Object.freeze({});
    }

    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(metadata)) {
      result[key] = String(value);
    }

    return Object.freeze(result);
  }

  // ========================================================================
  // CANCELLATION
  // ========================================================================

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw new Error("Prompt construction was cancelled.");
  }

  // ========================================================================
  // DEFAULT TEMPLATES
  // ========================================================================

  private registerDefaultTemplates(): void {
    for (const template of INTERVIEW_PROMPT_TEMPLATES) {
      this.registry.register(template, true);
    }

    this.registry.register(DEFAULT_SYSTEM_TEMPLATE, true);

    this.registry.register(DEFAULT_VISION_TEMPLATE, true);
  }
}
