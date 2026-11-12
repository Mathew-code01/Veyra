// Relative path: desktop/preload/types.ts

/**
 * Veyra Preload API Types
 *
 * Renderer-safe contracts for the Electron preload layer.
 *
 * SECURITY:
 * - No Node.js APIs are exposed.
 * - No Electron internals are exposed.
 * - ipcRenderer is never part of the public renderer API.
 * - Core services remain inside Electron main.
 */

import type {
  HardwareModelPlanResponse,
  HardwareSnapshotResponse,
} from "../../shared/types/hardware";

import type {
  AIProviderStatusRequest,
  AIProviderStatusResult,
  AIGenerateRequest,
  AIGenerateResult,
} from "../../shared/contracts/ai.contract";

import type { InterviewGuidanceRequest } from "../ipc/interview.ipc";

import type {
  DocumentImportRequest,
  DocumentImportResult,
  DocumentReadRequest,
  DocumentDeleteRequest,
  DocumentPickRequest,
  DocumentPickerIpcResult,
  DocumentListItem,
} from "../ipc/document.ipc";

import type {
  MemorySearchRequest,
  MemoryListRequest,
  MemoryCreateRequest,
  MemoryUpdateRequest,
  MemoryDeleteRequest,
} from "../ipc/memory.ipc";

import type {
  CandidateProfileRequest,
  CandidateProfileSaveRequest,
  CandidateRecordRequest,
  CandidateRecordSaveRequest,
} from "../ipc/candidate.ipc";

import type {
  CandidateExperience,
  CandidateProfile,
  CandidateProject,
  CandidateSkill,
  CandidateStory,
} from "../../core/candidate/contracts/CandidateTypes";

import type {
  ProvidersGetStatusResult,
  ProvidersSaveCredentialRequest,
  ProvidersSaveCredentialResult,
  ProvidersDeleteCredentialResult,
  ProvidersVerifyCredentialRequest,
  ProvidersVerifyCredentialResult,
  ProvidersListModelsRequest,
  ProvidersListModelsResult,
  ProvidersSetPreferredModelRequest,
  ProvidersSetExecutionModeRequest,
} from "../ipc/providers.ipc";

import type {
  AudioListDevicesRequest,
  AudioListDevicesResponse,
  AudioListDevicesResult,
  AudioPermissionRequest,
  AudioPermissionResponse,
  AudioPermissionResult,
  AudioSessionStartRequest,
  AudioSessionStartResponse,
  AudioSessionStartResult,
  AudioSessionStopRequest,
  AudioSessionStopResponse,
  AudioSessionStopResult,
  AudioSessionStateRequest,
  AudioSessionStateResponse,
  AudioSessionStateResult,
  AudioTranscriptStateRequest,
  AudioTranscriptStateResponse,
  AudioTranscriptStateResult,
  AudioMetricsRequest,
  AudioMetricsResponse,
  AudioMetricsResult,
} from "../../shared/contracts/audio.contract";

import type {
  InterviewAnalysisResult,
  InterviewTaskResult,
  InterviewExecuteAIResult,
  InterviewDomainClassifyResult,
  InterviewQuestionUnderstandResult,
  InterviewPlanAnswerResult,
  InterviewEvaluateAnswerResult,
  InterviewCommunicationFeedbackResult,
  InterviewFollowUpResult,
} from "../../shared/contracts/interview.contract";

import type {
  InterviewAnalysisRequest,
  InterviewTaskRequest,
  InterviewDomain,
  QuestionUnderstanding,
  ResponseMode,
} from "../../shared/types/interviews";

/**
 * Result returned by window-management operations.
 */
export interface WindowOperationResult {
  readonly success: boolean;
  readonly reason?: string;
  readonly maximized?: boolean;
}

/**
 * Hardware API exposed to the renderer.
 */
export interface VeyraHardwareApi {
  /**
   * Returns the cached hardware profile when available.
   */
  getProfile(
    options?: {
      readonly forceRefresh?: boolean;
    },
  ): Promise<HardwareSnapshotResponse>;

  /**
   * Forces a fresh hardware scan.
   */
  refreshProfile(): Promise<HardwareSnapshotResponse>;

  /**
   * Returns the hardware-aware model selection plan.
   */
  getModelPlan(
    options?: {
      readonly forceRefresh?: boolean;
    },
  ): Promise<HardwareModelPlanResponse>;
}

/**
 * Application information API.
 */
export interface VeyraAppApi {
  getVersion(): Promise<string>;

  getPlatform(): Promise<NodeJS.Platform>;

  getEnvironment(): Promise<
    "development" | "production"
  >;
}

/**
 * Window management API.
 */
export interface VeyraWindowApi {
  minimize(): Promise<WindowOperationResult>;

  maximize(): Promise<WindowOperationResult>;

  close(): Promise<WindowOperationResult>;

  isMaximized(): Promise<boolean>;

  isAvailable(): Promise<boolean>;
}

/**
 * AI API exposed to the renderer.
 */
export interface VeyraAiApi {
  /**
   * Request non-streaming AI generation through a registered provider.
   *
   * Returns an explicit Result so the renderer can handle provider
   * unavailability and validation failures.
   */
  generate(
    request: AIGenerateRequest,
  ): Promise<AIGenerateResult>;

  /**
   * Returns health/status information for every registered AI provider.
   */
  providerStatus(
    request?: AIProviderStatusRequest,
  ): Promise<AIProviderStatusResult>;
}

/**
 * Interview API exposed to the renderer.
 */
export interface VeyraInterviewApi {
  /**
   * Runs deterministic interview analysis and returns the InterviewAnalysis
   * with optional candidate/context enrichment.
   */
  analyze(
    request: Omit<InterviewAnalysisRequest, "signal">,
  ): Promise<InterviewAnalysisResult>;

  /**
   * Detects the concrete interview task represented by the conversation.
   */
  detectTask(
    request: Omit<InterviewTaskRequest, "signal">,
  ): Promise<InterviewTaskResult>;

  /**
   * Executes the complete interview orchestration path (analysis, candidate,
   * context, prompt construction, AI execution) and returns an executed
   * interview response.
   */
  guidance(
    request: InterviewGuidanceRequest,
  ): Promise<InterviewExecuteAIResult>;

  /**
   * Classifies the professional domain (e.g. software, data, finance, healthcare, HR).
   */
  classifyDomain(
    question: string,
  ): Promise<InterviewDomainClassifyResult>;

  /**
   * Performs deep question understanding (intent, archetype, competencies, requirements).
   */
  understandQuestion(
    question: string,
    evidenceTexts?: readonly string[],
  ): Promise<InterviewQuestionUnderstandResult>;

  /**
   * Constructs an answer planning framework (STAR, STAR-L, PREP, TET, PASR, etc.).
   */
  planAnswer(
    understanding: QuestionUnderstanding,
    domain: InterviewDomain,
    responseMode?: ResponseMode,
  ): Promise<InterviewPlanAnswerResult>;

  /**
   * Evaluates candidate answer quality across 11 key dimensions.
   */
  evaluateAnswer(options: {
    readonly answerText: string;
    readonly questionUnderstanding: QuestionUnderstanding;
    readonly domain: InterviewDomain;
    readonly targetRole?: string;
  }): Promise<InterviewEvaluateAnswerResult>;

  /**
   * Analyzes speech/text for grammar, filler words, awkward phrasing, and tone.
   */
  communicationFeedback(
    text: string,
  ): Promise<InterviewCommunicationFeedbackResult>;

  /**
   * Generates grounded interviewer follow-up questions.
   */
  generateFollowUps(
    previousAnswer: string,
    understanding: QuestionUnderstanding,
    domain: InterviewDomain,
  ): Promise<InterviewFollowUpResult>;
}

/**
 * Document API exposed to the renderer.
 */
export interface VeyraDocumentApi {
  /**
   * Open an authorized file picker and return opaque file handles.
   *
   * The renderer never receives direct filesystem access.
   */
  pick(
    request?: DocumentPickRequest,
  ): Promise<{
    readonly success: boolean;

    readonly data?: DocumentPickerIpcResult;

    readonly error?: Error;
  }>;

  /**
   * Import a document through the full ingestion pipeline.
   *
   * Returns validation, classification, processing status, and optional
   * AI analysis / candidate evidence results.
   */
  import(
    request: DocumentImportRequest,
  ): Promise<{
    readonly success: boolean;

    readonly data?: DocumentImportResult;

    readonly error?: Error;
  }>;

  /**
   * Return the stored processed document by ID.
   */
  read(
    request: DocumentReadRequest,
  ): Promise<{
    readonly success: boolean;

    readonly data?: import("../../core/documents/DocumentTypes").ProcessedDocument;

    readonly error?: Error;
  }>;

  /**
   * Delete a stored document and its derived data.
   */
  delete(
    request: DocumentDeleteRequest,
  ): Promise<{
    readonly success: boolean;

    readonly error?: Error;
  }>;

  /**
   * List all stored processed documents.
   */
  list(): Promise<{
    readonly success: boolean;

    readonly data?: readonly DocumentListItem[];

    readonly error?: Error;
  }>;
}

/**
 * Memory API exposed to the renderer.
 *
 * Every operation is scoped to profileId to enforce profile isolation in
 * the main process.
 */
export interface VeyraMemoryApi {
  /**
   * Keyword/filtered search over persistent memory (profile-scoped).
   */
  search(
    request: MemorySearchRequest,
  ): Promise<{
    readonly success: boolean;

    readonly data?: readonly unknown[];

    readonly error?: Error;
  }>;

  /**
   * List memory records for a profile.
   */
  list(
    request: MemoryListRequest,
  ): Promise<{
    readonly success: boolean;

    readonly data?: readonly unknown[];

    readonly error?: Error;
  }>;

  /**
   * Create a durable memory record scoped to profileId.
   */
  create(
    request: MemoryCreateRequest,
  ): Promise<{
    readonly success: boolean;

    readonly data?: { readonly memoryId: string };

    readonly error?: Error;
  }>;

  /**
   * Update a memory record scoped to profileId.
   */
  update(
    request: MemoryUpdateRequest,
  ): Promise<{
    readonly success: boolean;

    readonly error?: Error;
  }>;

  /**
   * Soft-delete a memory record scoped to profileId.
   */
  delete(
    request: MemoryDeleteRequest,
  ): Promise<{
    readonly success: boolean;

    readonly error?: Error;
  }>;
}

/**
 * Provider settings (BYOK) API exposed to the renderer.
 *
 * No raw API key ever crosses this boundary: credentials are written,
 * verified, and deleted in the main process. The renderer receives only
 * status, masked values, model lists, and operation results.
 */
export interface VeyraProvidersApi {
  /**
   * Returns the execution mode and per-provider status (configured/masked
   * key, preferred model, models) for the active profile.
   */
  getStatus(): Promise<{
    readonly success: boolean;
    readonly data?: ProvidersGetStatusResult;
    readonly error?: Error;
  }>;

  /**
   * Securely stores a BYOK API key for a provider. The raw secret is
   * encrypted with OS-backed storage; only status is returned.
   */
  saveCredential(
    request: ProvidersSaveCredentialRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: ProvidersSaveCredentialResult;
    readonly error?: Error;
  }>;

  /**
   * Deletes a stored BYOK credential for a provider.
   */
  deleteCredential(
    request: { readonly providerId: string },
  ): Promise<{
    readonly success: boolean;
    readonly data?: ProvidersDeleteCredentialResult;
    readonly error?: Error;
  }>;

  /**
   * Verifies a stored credential with a provider health check only. No
   * generation/inference request is issued, so no inference quota is
   * consumed.
   */
  verifyCredential(
    request: ProvidersVerifyCredentialRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: ProvidersVerifyCredentialResult;
    readonly error?: Error;
  }>;

  /**
   * Returns the available models for a provider.
   */
  listModels(
    request: ProvidersListModelsRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: ProvidersListModelsResult;
    readonly error?: Error;
  }>;

  /**
   * Sets the user's preferred model for a provider.
   */
  setPreferredModel(
    request: ProvidersSetPreferredModelRequest,
  ): Promise<{ readonly success: boolean; readonly error?: Error }>;

  /**
   * Sets the AI execution mode (local-only / cloud-only / hybrid).
   */
  setExecutionMode(
    request: ProvidersSetExecutionModeRequest,
  ): Promise<{ readonly success: boolean; readonly error?: Error }>;
}

/**
 * Complete renderer-facing Veyra API.
 */
export interface VeyraDesktopAPI {
  readonly app: VeyraAppApi;

  readonly window: VeyraWindowApi;

  readonly hardware: VeyraHardwareApi;

  readonly ai: VeyraAiApi;

  readonly interview: VeyraInterviewApi;

  readonly document: VeyraDocumentApi;

  readonly memory: VeyraMemoryApi;

  readonly candidate: VeyraCandidateApi;

  readonly providers: VeyraProvidersApi;

  readonly audio: VeyraAudioApi;

  readonly practice: VeyraPracticeApi;

  readonly runtime: VeyraRuntimeApi;
}

/**
 * Audio API exposed to the renderer.
 *
 * All operations are scoped to audio sessions. The renderer never
 * receives raw audio buffers or direct microphone access.
 */
export interface VeyraAudioApi {
  /**
   * Returns available audio input devices.
   */
  listDevices(
    request?: AudioListDevicesRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: AudioListDevicesResponse;
    readonly error?: Error;
  }>;

  /**
   * Returns the current microphone permission state.
   */
  permissionStatus(
    request?: AudioPermissionRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: AudioPermissionResponse;
    readonly error?: Error;
  }>;

  /**
   * Requests microphone permission.
   */
  requestPermission(
    request?: AudioPermissionRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: AudioPermissionResponse;
    readonly error?: Error;
  }>;

  /**
   * Starts an audio capture session.
   */
  startSession(
    request: AudioSessionStartRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: AudioSessionStartResponse;
    readonly error?: Error;
  }>;

  /**
   * Stops an audio capture session.
   */
  stopSession(
    request: AudioSessionStopRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: AudioSessionStopResponse;
    readonly error?: Error;
  }>;

  /**
   * Returns the current state of an audio session.
   */
  sessionState(
    request: AudioSessionStateRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: AudioSessionStateResponse;
    readonly error?: Error;
  }>;

  /**
   * Returns the transcript state for an audio session.
   */
  transcriptState(
    request: AudioTranscriptStateRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: AudioTranscriptStateResponse;
    readonly error?: Error;
  }>;

  /**
   * Returns audio metrics for a session.
   */
  metrics(
    request: AudioMetricsRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: AudioMetricsResponse;
    readonly error?: Error;
  }>;
}

export interface VeyraPracticeApi {
  createSession(request: unknown): Promise<{ readonly success: boolean; readonly data?: any; readonly error?: Error }>;
  getSession(request: { readonly sessionId: string }): Promise<{ readonly success: boolean; readonly data?: any; readonly error?: Error }>;
  listSessions(request?: unknown): Promise<{ readonly success: boolean; readonly data?: readonly any[]; readonly error?: Error }>;
  submitAnswer(request: { readonly sessionId: string; readonly questionId: string; readonly answerText: string }): Promise<{ readonly success: boolean; readonly data?: any; readonly error?: Error }>;
  nextQuestion(request: { readonly sessionId: string }): Promise<{ readonly success: boolean; readonly data?: any; readonly error?: Error }>;
  pauseSession(request: { readonly sessionId: string }): Promise<{ readonly success: boolean; readonly data?: any; readonly error?: Error }>;
  resumeSession(request: { readonly sessionId: string }): Promise<{ readonly success: boolean; readonly data?: any; readonly error?: Error }>;
  completeSession(request: { readonly sessionId: string }): Promise<{ readonly success: boolean; readonly data?: any; readonly error?: Error }>;
  getReport(request: { readonly sessionId: string }): Promise<{ readonly success: boolean; readonly data?: any; readonly error?: Error }>;
}
export interface VeyraRuntimeApi {
  createSession(request: { readonly mode: "practice" | "live"; readonly candidateId?: string; readonly targetRole?: string; readonly domain?: string; readonly interviewType?: string; readonly jobDescription?: string; readonly questionCount?: number; readonly title?: string }): Promise<{ readonly success: boolean; readonly data?: any; readonly error?: Error }>;
  startSession(request: { readonly sessionId: string }): Promise<{ readonly success: boolean; readonly data?: any; readonly error?: Error }>;
  pauseSession(request: { readonly sessionId: string }): Promise<{ readonly success: boolean; readonly data?: any; readonly error?: Error }>;
  resumeSession(request: { readonly sessionId: string }): Promise<{ readonly success: boolean; readonly data?: any; readonly error?: Error }>;
  cancelSession(request: { readonly sessionId: string; readonly reason?: string }): Promise<{ readonly success: boolean; readonly data?: any; readonly error?: Error }>;
  completeSession(request: { readonly sessionId: string }): Promise<{ readonly success: boolean; readonly data?: any; readonly error?: Error }>;
  getState(request: { readonly sessionId: string }): Promise<{ readonly success: boolean; readonly data?: any; readonly error?: Error }>;
  processQuestion(request: { readonly sessionId: string; readonly text: string; readonly source?: "typed" | "voice_transcript" | "screen_context" | "practice_answer"; readonly generateAI?: boolean; readonly aiProvider?: string }): Promise<{ readonly success: boolean; readonly data?: any; readonly error?: Error }>;
  submitAnswer(request: { readonly sessionId: string; readonly questionId: string; readonly answerText: string }): Promise<{ readonly success: boolean; readonly data?: any; readonly error?: Error }>;
}
export interface VeyraCandidateApi {
  listProfiles(): Promise<{
    readonly success: boolean;
    readonly data?: readonly CandidateProfile[];
    readonly error?: Error;
  }>;
  getProfile(request: CandidateProfileRequest): Promise<{
    readonly success: boolean;
    readonly data?: CandidateProfile;
    readonly error?: Error;
  }>;
  saveProfile(request: CandidateProfileSaveRequest): Promise<{
    readonly success: boolean;
    readonly data?: { readonly candidateId: string };
    readonly error?: Error;
  }>;
  deleteProfile(request: CandidateProfileRequest): Promise<{
    readonly success: boolean;
    readonly error?: Error;
  }>;
  listRecords(request: CandidateRecordRequest): Promise<{
    readonly success: boolean;
    readonly data?: readonly (
      | CandidateExperience
      | CandidateProject
      | CandidateSkill
      | CandidateStory
    )[];
    readonly error?: Error;
  }>;
  getRecord(request: CandidateRecordRequest & { readonly recordId: string }): Promise<{
    readonly success: boolean;
    readonly data?: CandidateExperience | CandidateProject | CandidateSkill | CandidateStory;
    readonly error?: Error;
  }>;
  saveRecord(request: CandidateRecordSaveRequest): Promise<{
    readonly success: boolean;
    readonly error?: Error;
  }>;
  deleteRecord(request: CandidateRecordRequest & { readonly recordId: string }): Promise<{
    readonly success: boolean;
    readonly error?: Error;
  }>;
}

/**
 * Global renderer Window augmentation.
 *
 * React code can safely access:
 *
 * window.veyra.app
 * window.veyra.window
 * window.veyra.hardware
 * window.veyra.ai
 * window.veyra.interview
 * window.veyra.document
 * window.veyra.memory
 * window.veyra.candidate
 */
declare global {
  interface Window {
    readonly veyra: VeyraDesktopAPI;
  }
}

export {};