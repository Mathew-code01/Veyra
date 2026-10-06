// ============================================================================
// FILE: core/prompts/contracts/PromptTypes.ts
//
// PURPOSE:
// Canonical internal contracts for the Veyra Prompt subsystem.
//
// ARCHITECTURE:
//
//     InterviewAnalysis
//            │
//            ▼
//     PromptInstructionSet
//            │
//            ▼
//        AIRequest
//
// IMPORTANT:
//
// This file belongs to core/prompts.
//
// It may depend on shared domain contracts, but it must NOT depend on:
// - AI provider implementations
// - AIManager
// - CloudGateway
// - local model runtimes
// - ContextManager implementation
// - CandidateService implementation
//
// The prompt subsystem translates already-resolved domain information into
// deterministic model instructions.
// ============================================================================

import type {
  AIMessage,
  AIRequest,
  AIRequestMode,
  AIResponseFormat,
} from "../../../shared/types/ai";

import type {
  InterviewAnalysis,
  InterviewType,
} from "../../../shared/types/interviews";

// ============================================================================
// PROMPT FAMILY
// ============================================================================

export type PromptFamily = "interview" | "system" | "vision";

// ============================================================================
// PROMPT KIND
// ============================================================================

export type PromptKind = InterviewType | "default" | "vision";

// ============================================================================
// PROMPT SOURCE
// ============================================================================

export type PromptSource =
  "template" | "system" | "vision" | "dynamic" | "fallback";

// ============================================================================
// CANDIDATE EVIDENCE
// ============================================================================

/**
 * Verified candidate evidence supplied by the candidate subsystem.
 *
 * PromptService must never invent these values.
 */
export interface PromptCandidateEvidence {
  readonly candidateId?: string;

  /**
   * Human-readable candidate information.
   *
   * This should already have been filtered/approved by the candidate layer.
   */
  readonly summary?: string;

  /**
   * Individual verified facts.
   */
  readonly facts?: readonly string[];

  /**
   * Relevant experience, projects, skills, education, etc.
   */
  readonly relevantEvidence?: readonly string[];
}

// ============================================================================
// CONTEXT EVIDENCE
// ============================================================================

/**
 * Context retrieved by the Context subsystem.
 *
 * PromptService does not retrieve it.
 */
export interface PromptContextEvidence {
  /**
   * Human-readable compressed context.
   */
  readonly text?: string;

  /**
   * IDs used for provenance.
   */
  readonly contextIds?: readonly string[];

  /**
   * Optional source labels.
   */
  readonly sources?: readonly string[];
}

// ============================================================================
// PROMPT INPUT
// ============================================================================

/**
 * All already-resolved information available to prompt construction.
 */
export interface PromptBuildInput {
  /**
   * Interview-domain interpretation.
   */
  readonly analysis?: InterviewAnalysis;

  /**
   * Optional candidate evidence.
   */
  readonly candidate?: PromptCandidateEvidence;

  /**
   * Optional retrieved context.
   */
  readonly context?: PromptContextEvidence;

  /**
   * Optional direct task/question override.
   */
  readonly question?: string;

  /**
   * Optional user/application instruction.
   */
  readonly instruction?: string;

  /**
   * Optional preferred response style.
   */
  readonly responseStyle?: PromptResponseStyle;

  /**
   * Abort signal for long-running orchestration.
   */
  readonly signal?: AbortSignal;
}

// ============================================================================
// RESPONSE STYLE
// ============================================================================

export type PromptResponseStyle =
  "concise" | "balanced" | "detailed" | "interview-ready";

// ============================================================================
// PROMPT SECTION
// ============================================================================

/**
 * One semantic section of a prompt.
 *
 * Keeping sections structured before normalization makes the prompt system
 * easier to test, inspect, log, and evolve.
 */
export interface PromptSection {
  readonly id: string;

  readonly role: AIMessage["role"];

  readonly content: string;

  readonly priority?: "required" | "important" | "optional";
}

// ============================================================================
// PROMPT INSTRUCTION SET
// ============================================================================

/**
 * Canonical output of PromptService.
 *
 * This is the main artifact produced by core/prompts.
 */
export interface PromptInstructionSet {
  readonly family: PromptFamily;

  readonly kind: PromptKind;

  readonly source: PromptSource;

  /**
   * High-level AI request mode.
   */
  readonly mode?: AIRequestMode;

  /**
   * Ordered semantic prompt sections.
   */
  readonly sections: readonly PromptSection[];

  /**
   * Normalized AI messages.
   */
  readonly messages: readonly AIMessage[];

  /**
   * Candidate/context provenance.
   */
  readonly candidateId?: string;

  readonly contextIds?: readonly string[];

  /**
   * Whether candidate grounding was available.
   */
  readonly grounded: boolean;

  /**
   * Recommended generation settings.
   */
  readonly generation?: PromptGenerationSettings;

  /**
   * Debug-safe metadata.
   */
  readonly metadata?: Readonly<Record<string, string>>;

  /**
   * Optional original interview analysis.
   *
   * This is useful to orchestration consumers, but AI providers do not need
   * to receive it directly.
   */
  readonly analysis?: InterviewAnalysis;
}

// ============================================================================
// GENERATION SETTINGS
// ============================================================================

export interface PromptGenerationSettings {
  readonly temperature?: number;

  readonly maxTokens?: number;

  readonly topP?: number;

  readonly topK?: number;

  readonly responseFormat?: AIResponseFormat;
}

// ============================================================================
// AI REQUEST OPTIONS
// ============================================================================

/**
 * Options for converting PromptInstructionSet into the shared AIRequest.
 *
 * This does not execute the request.
 */
export interface PromptAIRequestOptions {
  readonly requestId: AIRequest["requestId"];

  readonly provider?: AIRequest["provider"];

  readonly model?: string;

  readonly stream?: boolean;

  readonly timeoutMs?: number;

  readonly signal?: AbortSignal;

  readonly metadata?: Readonly<Record<string, string>>;
}

// ============================================================================
// PROMPT RESULT
// ============================================================================

export interface PromptBuildResult {
  readonly prompt: PromptInstructionSet;

  /**
   * Convenience representation ready for core/ai.
   */
  readonly request: AIRequest;
}

// ============================================================================
// TEMPLATE CONTEXT
// ============================================================================

/**
 * Internal context supplied to a prompt template.
 */
export interface PromptTemplateContext {
  readonly input: PromptBuildInput;

  readonly analysis?: InterviewAnalysis;

  readonly question: string;

  readonly candidate?: PromptCandidateEvidence;

  readonly context?: PromptContextEvidence;

  readonly responseStyle: PromptResponseStyle;
}
