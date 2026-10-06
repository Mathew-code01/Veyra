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
// Those belong elsewhere.
//
// IMPORTANT:
//
// PromptService does not call AIManager.
// It only prepares the shared AIRequest contract.
// ============================================================================

import type { AIRequest, AIRequestMode } from "../../../shared/types/ai";

import type {
  InterviewAnalysis,
  InterviewType,
} from "../../../shared/types/interviews";

import type { PromptBuilder } from "../contracts/PromptBuilder";

import type {
  PromptBuildInput,
  PromptAIRequestOptions,
  PromptBuildResult,
  PromptInstructionSet,
} from "../contracts/PromptTypes";

import { PromptRegistry } from "../registry/PromptRegistry";

import { PromptNormalizer } from "../normalization/PromptNormalizer";

import { InterviewPromptBuilder } from "../builders/InterviewPromptBuilder";

import { SystemPromptBuilder } from "../builders/SystemPromptBuilder";

import { VisionPromptBuilder } from "../builders/VisionPromptBuilder";

import { INTERVIEW_PROMPT_TEMPLATES } from "../templates/interview";

import { DEFAULT_SYSTEM_TEMPLATE } from "../templates/system/default";

import { DEFAULT_VISION_TEMPLATE } from "../templates/vision/default";

// ============================================================================
// OPTIONS
// ============================================================================

export interface PromptServiceOptions {
  readonly registry?: PromptRegistry;

  readonly normalizer?: PromptNormalizer;

  readonly interviewBuilder?: InterviewPromptBuilder;

  readonly systemBuilder?: SystemPromptBuilder;

  readonly visionBuilder?: VisionPromptBuilder;

  /**
   * Whether the default templates should be registered automatically.
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

  public constructor(options: PromptServiceOptions = {}) {
    this.registry = options.registry ?? new PromptRegistry();

    this.normalizer = options.normalizer ?? new PromptNormalizer();

    this.interviewBuilder =
      options.interviewBuilder ?? new InterviewPromptBuilder();

    this.systemBuilder = options.systemBuilder ?? new SystemPromptBuilder();

    this.visionBuilder = options.visionBuilder ?? new VisionPromptBuilder();

    if (options.registerDefaults ?? true) {
      this.registerDefaultTemplates();
    }
  }

  // ========================================================================
  // PUBLIC TEMPLATE REGISTRATION
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
   * Build the prompt for an already-analyzed interview task.
   */
  public buildInterviewPrompt(input: PromptBuildInput): PromptInstructionSet {
    this.validateInput(input);

    if (!input.analysis) {
      throw new Error(
        "Interview prompt construction requires InterviewAnalysis.",
      );
    }

    this.throwIfAborted(input.signal);

    return this.normalizer.normalize(this.interviewBuilder.build(input));
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
   * Builds the complete prompt by combining:
   *
   *     universal system instructions
   *             +
   *     interview task instructions
   *
   * This is the normal path for interview AI generation.
   */
  public buildInterview(input: PromptBuildInput): PromptInstructionSet {
    this.validateInput(input);

    if (!input.analysis) {
      throw new Error("InterviewAnalysis is required.");
    }

    this.throwIfAborted(input.signal);

    const system = this.buildSystemPrompt(input);

    const interview = this.buildInterviewPrompt(input);

    const sections = [...system.sections, ...interview.sections];

    const messages = this.normalizer.toMessages(sections);

    return Object.freeze({
      ...interview,
      sections: Object.freeze(sections),
      messages,
      family: "interview",
      kind: input.analysis.classification.type,
      source: "template",
      grounded: interview.grounded || system.grounded,
    });
  }

  // ========================================================================
  // CONVERT TO AI REQUEST
  // ========================================================================

  /**
   * Convert prompt instructions into the canonical shared AIRequest.
   *
   * IMPORTANT:
   *
   * This does not execute anything.
   *
   * core/ai receives the resulting request and decides how to execute it.
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

    const generation = prompt.generation;

    const request: AIRequest = {
      requestId: options.requestId,

      provider: options.provider,

      model: options.model,

      mode: prompt.mode,

      messages: prompt.messages,

      options: generation
        ? Object.freeze({
            temperature: generation.temperature,

            maxTokens: generation.maxTokens,

            topP: generation.topP,

            topK: generation.topK,

            responseFormat: generation.responseFormat,

            metadata: prompt.metadata,
          })
        : prompt.metadata
          ? Object.freeze({
              metadata: prompt.metadata,
            })
          : undefined,

      signal: options.signal,

      timeoutMs: options.timeoutMs,

      stream: options.stream,

      metadata: Object.freeze({
        ...prompt.metadata,
        promptFamily: prompt.family,
        promptKind: prompt.kind,
        promptSource: prompt.source,
        grounded: String(prompt.grounded),
        ...(prompt.candidateId
          ? {
              candidateId: prompt.candidateId,
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
   * Convenience method used by higher-level orchestration.
   *
   * This produces both:
   *
   * - PromptInstructionSet
   * - AIRequest
   *
   * but still does not call AIManager.
   */
  public buildInterviewRequest(
    input: PromptBuildInput,
    options: PromptAIRequestOptions,
  ): PromptBuildResult {
    const prompt = this.buildInterview(input);

    const request = this.toAIRequest(prompt, options);

    return Object.freeze({
      prompt,
      request,
    });
  }

  // ========================================================================
  // TYPE HELPERS
  // ========================================================================

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

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw new Error("Prompt construction was cancelled.");
  }

  // ========================================================================
  // DEFAULT REGISTRATION
  // ========================================================================

  private registerDefaultTemplates(): void {
    for (const template of INTERVIEW_PROMPT_TEMPLATES) {
      this.registry.register(template, true);
    }

    this.registry.register(DEFAULT_SYSTEM_TEMPLATE, true);

    this.registry.register(DEFAULT_VISION_TEMPLATE, true);
  }
}
