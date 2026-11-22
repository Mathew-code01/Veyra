// Relative path: desktop/preload/api.ts

/**
 * Veyra Secure Preload API
 *
 * SECURITY MODEL
 * ─────────────────────────────────────────────────────────────
 *
 * Renderer
 *    ↓
 * window.veyra
 *    ↓
 * preload
 *    ↓
 * ipcRenderer.invoke(...)
 *    ↓
 * Electron main process
 *
 * The renderer never receives:
 *
 * - ipcRenderer
 * - Node.js process
 * - fs
 * - path
 * - child_process
 * - systeminformation
 * - HardwareProfiler
 * - ModelManager
 * - Electron internals
 *
 * Only explicitly approved IPC operations are exposed.
 */

import { ipcRenderer } from "electron";

import { IPC_CHANNELS } from "../../shared/constants/events";

import {
  HARDWARE_IPC_CHANNELS,
  type HardwareGetModelPlanRequest,
  type HardwareGetProfileRequest,
} from "../../shared/contracts/hardware.contract";

import type {
  AIProviderStatusRequest,
  AIProviderStatusResult,
  AIGenerateRequest,
  AIGenerateResult,
} from "../../shared/contracts/ai.contract";

import type {
  InterviewAnalysisResult,
  InterviewTaskResult,
  InterviewExecuteAIResult,
} from "../../shared/contracts/interview.contract";

import type {
  InterviewAnalysisRequest,
  InterviewTaskRequest,
  InterviewDomain,
  QuestionUnderstanding,
  ResponseMode,
} from "../../shared/types/interviews";

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
  WorkspaceProfileCreateRequest,
  WorkspaceProfileSelectionRequest,
} from "../ipc/workspace-profile.ipc";

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
  HardwareModelPlanResponse,
  HardwareSnapshotResponse,
  HardwareAssessmentResponse,
  ModelInstallProgress,
} from "../../shared/types/hardware";

import {
  UPDATER_IPC_CHANNELS,
  type UpdaterCheckRequest,
  type UpdaterDownloadRequest,
  type UpdaterInstallRequest,
  type UpdaterSetChannelRequest,
  type UpdaterSetAutoCheckRequest,
  type UpdaterProgressPayload,
  type UpdaterStateChangePayload,
} from "../../shared/contracts/updater.contract";
import type { UpdaterStatus, UpdateChannel } from "../../shared/types/updater";
import type { VeyraDesktopAPI, WindowOperationResult } from "./types";

/**
 * Generic request shape accepted by the hardware API.
 */
type HardwareRequest = {
  readonly forceRefresh?: boolean;
};

/**
 * Normalizes hardware requests before sending them
 * across the Electron IPC boundary.
 */
function normalizeHardwareRequest(
  request: HardwareRequest | undefined,
): HardwareGetProfileRequest | undefined {
  if (!request) {
    return undefined;
  }

  return Object.freeze({
    forceRefresh: request.forceRefresh === true,
  });
}

/**
 * Normalizes model-plan requests.
 */
function normalizeModelPlanRequest(
  request: HardwareRequest | undefined,
): HardwareGetModelPlanRequest | undefined {
  if (!request) {
    return undefined;
  }

  return Object.freeze({
    forceRefresh: request.forceRefresh === true,
  });
}

/**
 * Hardware API.
 *
 * Only whitelisted IPC channels are exposed.
 */
const hardwareApi: VeyraDesktopAPI["hardware"] = Object.freeze({
  getProfile: async (
    request: HardwareRequest | undefined,
  ): Promise<HardwareSnapshotResponse> => {
    const normalized = normalizeHardwareRequest(request);

    return ipcRenderer.invoke(
      HARDWARE_IPC_CHANNELS.GET_PROFILE,
      normalized,
    ) as Promise<HardwareSnapshotResponse>;
  },

  refreshProfile: async (): Promise<HardwareSnapshotResponse> => {
    return ipcRenderer.invoke(
      HARDWARE_IPC_CHANNELS.REFRESH_PROFILE,
    ) as Promise<HardwareSnapshotResponse>;
  },

  getModelPlan: async (
    request: HardwareRequest | undefined,
  ): Promise<HardwareModelPlanResponse> => {
    const normalized = normalizeModelPlanRequest(request);

    return ipcRenderer.invoke(
      HARDWARE_IPC_CHANNELS.GET_MODEL_PLAN,
      normalized,
    ) as Promise<HardwareModelPlanResponse>;
  },
  getAssessment: async (request?: HardwareRequest): Promise<HardwareAssessmentResponse> => ipcRenderer.invoke(HARDWARE_IPC_CHANNELS.GET_ASSESSMENT, normalizeHardwareRequest(request)) as Promise<HardwareAssessmentResponse>,
  installModel: async (modelId: string): Promise<{ readonly installed: boolean }> => {
    if (typeof modelId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(modelId)) throw new Error("Invalid model selection.");
    return ipcRenderer.invoke(HARDWARE_IPC_CHANNELS.INSTALL_MODEL, { modelId });
  },
  uninstallModel: async (modelId: string): Promise<{ readonly removed: boolean }> => {
    if (typeof modelId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(modelId)) throw new Error("Invalid model selection.");
    return ipcRenderer.invoke(HARDWARE_IPC_CHANNELS.UNINSTALL_MODEL, { modelId });
  },
  cancelInstall: async (modelId: string): Promise<{ readonly cancelled: boolean }> => ipcRenderer.invoke(HARDWARE_IPC_CHANNELS.CANCEL_INSTALL, { modelId }),
  onInstallProgress: (callback: (progress: ModelInstallProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ModelInstallProgress) => callback(progress);
    ipcRenderer.on(HARDWARE_IPC_CHANNELS.INSTALL_PROGRESS, listener);
    return () => ipcRenderer.removeListener(HARDWARE_IPC_CHANNELS.INSTALL_PROGRESS, listener);
  },
});

/**
 * AI API exposed to the renderer.
 *
 * Only whitelisted IPC channels are exposed. Results are returned as
 * explicit Result shapes so the renderer can handle provider unavailability
 * and validation failures without unhandled IPC rejections.
 */
const aiApi: VeyraDesktopAPI["ai"] = Object.freeze({
  generate: async (
    request: AIGenerateRequest,
  ): Promise<AIGenerateResult> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.AI_GENERATE,
      request,
    ) as Promise<AIGenerateResult>;
  },

  providerStatus: async (
    request?: AIProviderStatusRequest,
  ): Promise<AIProviderStatusResult> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.AI_PROVIDER_STATUS,
      request,
    ) as Promise<AIProviderStatusResult>;
  },
});

/**
 * Interview API exposed to the renderer.
 *
 * Only whitelisted IPC channels are exposed. Results are returned as
 * explicit Result shapes.
 */
const interviewApi: VeyraDesktopAPI["interview"] = Object.freeze({
  analyze: async (
    request: Omit<InterviewAnalysisRequest, "signal">,
  ): Promise<InterviewAnalysisResult> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.INTERVIEW_ANALYZE,
      request,
    ) as Promise<InterviewAnalysisResult>;
  },

  detectTask: async (
    request: Omit<InterviewTaskRequest, "signal">,
  ): Promise<InterviewTaskResult> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.INTERVIEW_TASK,
      request,
    ) as Promise<InterviewTaskResult>;
  },

  guidance: async (
    request: InterviewGuidanceRequest,
  ): Promise<InterviewExecuteAIResult> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.INTERVIEW_GUIDANCE,
      request,
    ) as Promise<InterviewExecuteAIResult>;
  },

  classifyDomain: async (
    question: string,
  ) => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.INTERVIEW_DOMAIN_CLASSIFY,
      { question },
    );
  },

  understandQuestion: async (
    question: string,
    evidenceTexts?: readonly string[],
  ) => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.INTERVIEW_QUESTION_UNDERSTAND,
      { question, evidenceTexts },
    );
  },

  planAnswer: async (
    understanding: QuestionUnderstanding,
    domain: InterviewDomain,
    responseMode?: ResponseMode,
  ) => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.INTERVIEW_PLAN_ANSWER,
      { understanding, domain, responseMode },
    );
  },

  evaluateAnswer: async (
    options: {
      readonly answerText: string;
      readonly questionUnderstanding: QuestionUnderstanding;
      readonly domain: InterviewDomain;
      readonly targetRole?: string;
    },
  ) => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.INTERVIEW_EVALUATE_ANSWER,
      options,
    );
  },

  communicationFeedback: async (
    text: string,
  ) => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.INTERVIEW_COMMUNICATION_FEEDBACK,
      { text },
    );
  },

  generateFollowUps: async (
    previousAnswer: string,
    understanding: QuestionUnderstanding,
    domain: InterviewDomain,
  ) => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.INTERVIEW_FOLLOW_UP,
      { previousAnswer, understanding, domain },
    );
  },
});

/**
 * Document API exposed to the renderer.
 *
 * Only whitelisted IPC channels are exposed. Results are returned as
 * explicit Result shapes.
 */
const documentApi: VeyraDesktopAPI["document"] = Object.freeze({
  pick: async (
    request?: DocumentPickRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: DocumentPickerIpcResult;
    readonly error?: Error;
  }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.DOCUMENT_PICK,
      request,
    ) as Promise<{
      readonly success: boolean;
      readonly data?: DocumentPickerIpcResult;
      readonly error?: Error;
    }>;
  },

  import: async (
    request: DocumentImportRequest,
  ): Promise<{ readonly success: boolean; readonly data?: DocumentImportResult; readonly error?: Error }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.DOCUMENT_IMPORT,
      request,
    ) as Promise<{ readonly success: boolean; readonly data?: DocumentImportResult; readonly error?: Error }>;
  },

  read: async (
    request: DocumentReadRequest,
  ): Promise<{ readonly success: boolean; readonly data?: import("../../core/documents/DocumentTypes").ProcessedDocument; readonly error?: Error }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.DOCUMENT_READ,
      request,
    ) as Promise<{ readonly success: boolean; readonly data?: import("../../core/documents/DocumentTypes").ProcessedDocument; readonly error?: Error }>;
  },

  delete: async (
    request: DocumentDeleteRequest,
  ): Promise<{ readonly success: boolean; readonly error?: Error }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.DOCUMENT_DELETE,
      request,
    ) as Promise<{ readonly success: boolean; readonly error?: Error }>;
  },

  list: async (): Promise<{ readonly success: boolean; readonly data?: readonly DocumentListItem[]; readonly error?: Error }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.DOCUMENT_LIST,
    ) as Promise<{ readonly success: boolean; readonly data?: readonly DocumentListItem[]; readonly error?: Error }>;
  },
});

/**
 * Memory API exposed to the renderer.
 *
 * Only whitelisted IPC channels are exposed. Results are returned as
 * explicit Result shapes. Every operation is scoped to profileId to enforce
 * profile isolation in the main process.
 */
const memoryApi: VeyraDesktopAPI["memory"] = Object.freeze({
  search: async (
    request: MemorySearchRequest,
  ): Promise<{ readonly success: boolean; readonly data?: readonly unknown[]; readonly error?: Error }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.MEMORY_SEARCH,
      request,
    ) as Promise<{ readonly success: boolean; readonly data?: readonly unknown[]; readonly error?: Error }>;
  },

  list: async (
    request: MemoryListRequest,
  ): Promise<{ readonly success: boolean; readonly data?: readonly unknown[]; readonly error?: Error }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.MEMORY_LIST,
      request,
    ) as Promise<{ readonly success: boolean; readonly data?: readonly unknown[]; readonly error?: Error }>;
  },

  create: async (
    request: MemoryCreateRequest,
  ): Promise<{ readonly success: boolean; readonly data?: { readonly memoryId: string }; readonly error?: Error }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.MEMORY_CREATE,
      request,
    ) as Promise<{ readonly success: boolean; readonly data?: { readonly memoryId: string }; readonly error?: Error }>;
  },

  update: async (
    request: MemoryUpdateRequest,
  ): Promise<{ readonly success: boolean; readonly error?: Error }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.MEMORY_UPDATE,
      request,
    ) as Promise<{ readonly success: boolean; readonly error?: Error }>;
  },

  delete: async (
    request: MemoryDeleteRequest,
  ): Promise<{ readonly success: boolean; readonly error?: Error }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.MEMORY_DELETE,
      request,
    ) as Promise<{ readonly success: boolean; readonly error?: Error }>;
  },
});

const candidateApi: VeyraDesktopAPI["candidate"] = Object.freeze({
  listProfiles: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.CANDIDATE_PROFILE_LIST) as ReturnType<
      VeyraDesktopAPI["candidate"]["listProfiles"]
    >,

  getProfile: async (request: CandidateProfileRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.CANDIDATE_PROFILE_GET, request) as ReturnType<
      VeyraDesktopAPI["candidate"]["getProfile"]
    >,

  saveProfile: async (request: CandidateProfileSaveRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.CANDIDATE_PROFILE_SAVE, request) as ReturnType<
      VeyraDesktopAPI["candidate"]["saveProfile"]
    >,

  deleteProfile: async (request: CandidateProfileRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.CANDIDATE_PROFILE_DELETE, request) as ReturnType<
      VeyraDesktopAPI["candidate"]["deleteProfile"]
    >,

  listRecords: async (request: CandidateRecordRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.CANDIDATE_RECORD_LIST, request) as ReturnType<
      VeyraDesktopAPI["candidate"]["listRecords"]
    >,

  getRecord: async (request: CandidateRecordRequest & { readonly recordId: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.CANDIDATE_RECORD_GET, request) as ReturnType<
      VeyraDesktopAPI["candidate"]["getRecord"]
    >,

  saveRecord: async (request: CandidateRecordSaveRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.CANDIDATE_RECORD_SAVE, request) as ReturnType<
      VeyraDesktopAPI["candidate"]["saveRecord"]
    >,

  deleteRecord: async (request: CandidateRecordRequest & { readonly recordId: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.CANDIDATE_RECORD_DELETE, request) as ReturnType<
      VeyraDesktopAPI["candidate"]["deleteRecord"]
    >,
});

const workspaceProfilesApi: VeyraDesktopAPI["workspaceProfiles"] = Object.freeze({
  list: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_PROFILE_LIST) as ReturnType<
      VeyraDesktopAPI["workspaceProfiles"]["list"]
    >,

  activate: async (request: WorkspaceProfileSelectionRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_PROFILE_ACTIVATE, request) as ReturnType<
      VeyraDesktopAPI["workspaceProfiles"]["activate"]
    >,

  create: async (request: WorkspaceProfileCreateRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_PROFILE_CREATE, request) as ReturnType<
      VeyraDesktopAPI["workspaceProfiles"]["create"]
    >,
});

/**
 * Provider settings (BYOK) API exposed to the renderer.
 *
 * Only whitelisted IPC channels are exposed. No raw API key ever crosses
 * this boundary: credentials are written and verified in the main process,
 * and the renderer receives only status, masked values, and model lists.
 */
const providersApi: VeyraDesktopAPI["providers"] = Object.freeze({
  getStatus: async () => {
    return ipcRenderer.invoke(IPC_CHANNELS.PROVIDERS_GET_STATUS) as Promise<{
      readonly success: boolean;
      readonly data?: ProvidersGetStatusResult;
      readonly error?: Error;
    }>;
  },

  saveCredential: async (
    request: ProvidersSaveCredentialRequest,
  ) => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.PROVIDERS_SAVE_CREDENTIAL,
      request,
    ) as Promise<{
      readonly success: boolean;
      readonly data?: ProvidersSaveCredentialResult;
      readonly error?: Error;
    }>;
  },

  deleteCredential: async (
    request: { readonly providerId: string },
  ) => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.PROVIDERS_DELETE_CREDENTIAL,
      request,
    ) as Promise<{
      readonly success: boolean;
      readonly data?: ProvidersDeleteCredentialResult;
      readonly error?: Error;
    }>;
  },

  verifyCredential: async (
    request: ProvidersVerifyCredentialRequest,
  ) => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.PROVIDERS_VERIFY_CREDENTIAL,
      request,
    ) as Promise<{
      readonly success: boolean;
      readonly data?: ProvidersVerifyCredentialResult;
      readonly error?: Error;
    }>;
  },

  listModels: async (
    request: ProvidersListModelsRequest,
  ) => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.PROVIDERS_LIST_MODELS,
      request,
    ) as Promise<{
      readonly success: boolean;
      readonly data?: ProvidersListModelsResult;
      readonly error?: Error;
    }>;
  },

  setPreferredModel: async (
    request: ProvidersSetPreferredModelRequest,
  ): Promise<{ readonly success: boolean; readonly error?: Error }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.PROVIDERS_SET_PREFERRED_MODEL,
      request,
    ) as Promise<{ readonly success: boolean; readonly error?: Error }>;
  },

  setExecutionMode: async (
    request: ProvidersSetExecutionModeRequest,
  ): Promise<{ readonly success: boolean; readonly error?: Error }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.PROVIDERS_SET_EXECUTION_MODE,
      request,
    ) as Promise<{ readonly success: boolean; readonly error?: Error }>;
  },
});

/**
 * Audio API exposed to the renderer.
 *
 * All operations go through IPC. The renderer never receives raw audio
 * buffers or direct microphone access.
 */
const audioApi: VeyraDesktopAPI["audio"] = {
  listDevices: async (
    request?: AudioListDevicesRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: AudioListDevicesResponse;
    readonly error?: Error;
  }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.AUDIO_DEVICES_LIST,
      request,
    ) as Promise<{
      readonly success: boolean;
      readonly data?: AudioListDevicesResponse;
      readonly error?: Error;
    }>;
  },

  permissionStatus: async (
    request?: AudioPermissionRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: AudioPermissionResponse;
    readonly error?: Error;
  }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.AUDIO_PERMISSION_STATUS,
      request,
    ) as Promise<{
      readonly success: boolean;
      readonly data?: AudioPermissionResponse;
      readonly error?: Error;
    }>;
  },

  requestPermission: async (
    request?: AudioPermissionRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: AudioPermissionResponse;
    readonly error?: Error;
  }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.AUDIO_PERMISSION_REQUEST,
      request,
    ) as Promise<{
      readonly success: boolean;
      readonly data?: AudioPermissionResponse;
      readonly error?: Error;
    }>;
  },

  startSession: async (
    request: AudioSessionStartRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: AudioSessionStartResponse;
    readonly error?: Error;
  }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.AUDIO_SESSION_START,
      request,
    ) as Promise<{
      readonly success: boolean;
      readonly data?: AudioSessionStartResponse;
      readonly error?: Error;
    }>;
  },

  stopSession: async (
    request: AudioSessionStopRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: AudioSessionStopResponse;
    readonly error?: Error;
  }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.AUDIO_SESSION_STOP,
      request,
    ) as Promise<{
      readonly success: boolean;
      readonly data?: AudioSessionStopResponse;
      readonly error?: Error;
    }>;
  },

  sessionState: async (
    request: AudioSessionStateRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: AudioSessionStateResponse;
    readonly error?: Error;
  }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.AUDIO_SESSION_STATE,
      request,
    ) as Promise<{
      readonly success: boolean;
      readonly data?: AudioSessionStateResponse;
      readonly error?: Error;
    }>;
  },

  transcriptState: async (
    request: AudioTranscriptStateRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: AudioTranscriptStateResponse;
    readonly error?: Error;
  }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.AUDIO_TRANSCRIPT_STATE,
      request,
    ) as Promise<{
      readonly success: boolean;
      readonly data?: AudioTranscriptStateResponse;
      readonly error?: Error;
    }>;
  },

  metrics: async (
    request: AudioMetricsRequest,
  ): Promise<{
    readonly success: boolean;
    readonly data?: AudioMetricsResponse;
    readonly error?: Error;
  }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.AUDIO_METRICS,
      request,
    ) as Promise<{
      readonly success: boolean;
      readonly data?: AudioMetricsResponse;
      readonly error?: Error;
    }>;
  },
};

/**
 * Complete renderer-facing API.
 *
 * IMPORTANT:
 *
 * Do not expose ipcRenderer itself.
 */
const audioRuntimeApi: VeyraDesktopAPI["audioRuntime"] = {
  startLiveSession: async (
    request: { readonly sessionId: string; readonly consentGiven?: boolean },
  ): Promise<{
    readonly success: boolean;
    readonly data?: unknown;
    readonly error?: Error;
  }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.AUDIO_RUNTIME_SESSION_START,
      request,
    ) as Promise<{
      readonly success: boolean;
      readonly data?: unknown;
      readonly error?: Error;
    }>;
  },

  stopLiveSession: async (
    request: { readonly sessionId: string },
  ): Promise<{
    readonly success: boolean;
    readonly data?: unknown;
    readonly error?: Error;
  }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.AUDIO_RUNTIME_SESSION_STOP,
      request,
    ) as Promise<{
      readonly success: boolean;
      readonly data?: unknown;
      readonly error?: Error;
    }>;
  },

  liveSessionState: async (
    request: { readonly sessionId: string },
  ): Promise<{
    readonly success: boolean;
    readonly data?: unknown;
    readonly error?: Error;
  }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.AUDIO_RUNTIME_SESSION_STATE,
      request,
    ) as Promise<{
      readonly success: boolean;
      readonly data?: unknown;
      readonly error?: Error;
    }>;
  },

  submitTranscript: async (
    request: { readonly sessionId: string; readonly text: string },
  ): Promise<{
    readonly success: boolean;
    readonly data?: unknown;
    readonly error?: Error;
  }> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.AUDIO_TRANSCRIPT_SUBMIT,
      request,
    ) as Promise<{
      readonly success: boolean;
      readonly data?: unknown;
      readonly error?: Error;
    }>;
  },
};

export const api: VeyraDesktopAPI = Object.freeze({
  app: Object.freeze({
    getVersion: (): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION) as Promise<string>,

    getPlatform: (): Promise<NodeJS.Platform> =>
      ipcRenderer.invoke(
        IPC_CHANNELS.APP_GET_PLATFORM,
      ) as Promise<NodeJS.Platform>,

    getEnvironment: (): Promise<"development" | "production"> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_GET_ENVIRONMENT) as Promise<
        "development" | "production"
      >,
  }),

  window: Object.freeze({
    minimize: (): Promise<WindowOperationResult> =>
      ipcRenderer.invoke(
        IPC_CHANNELS.WINDOW_MINIMIZE,
      ) as Promise<WindowOperationResult>,

    maximize: (): Promise<WindowOperationResult> =>
      ipcRenderer.invoke(
        IPC_CHANNELS.WINDOW_MAXIMIZE,
      ) as Promise<WindowOperationResult>,

    close: (): Promise<WindowOperationResult> =>
      ipcRenderer.invoke(
        IPC_CHANNELS.WINDOW_CLOSE,
      ) as Promise<WindowOperationResult>,

    isMaximized: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED) as Promise<boolean>,

    isAvailable: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_AVAILABLE) as Promise<boolean>,
  }),

  hardware: hardwareApi,

  ai: aiApi,

  interview: interviewApi,

  document: documentApi,

  memory: memoryApi,

  candidate: candidateApi,

  workspaceProfiles: workspaceProfilesApi,

  providers: providersApi,

  practice: Object.freeze({
    createSession: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRACTICE_CREATE_SESSION, request),
    getSession: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRACTICE_GET_SESSION, request),
    listSessions: (request?: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRACTICE_LIST_SESSIONS, request),
    submitAnswer: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRACTICE_SUBMIT_ANSWER, request),
    nextQuestion: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRACTICE_NEXT_QUESTION, request),
    pauseSession: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRACTICE_PAUSE_SESSION, request),
    resumeSession: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRACTICE_RESUME_SESSION, request),
    completeSession: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRACTICE_COMPLETE_SESSION, request),
    getReport: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRACTICE_GET_REPORT, request),
  }),
  runtime: Object.freeze({
    createSession: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS.RUNTIME_CREATE_SESSION, request),
    startSession: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS.RUNTIME_START_SESSION, request),
    pauseSession: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS.RUNTIME_PAUSE_SESSION, request),
    resumeSession: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS.RUNTIME_RESUME_SESSION, request),
    cancelSession: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS.RUNTIME_CANCEL_SESSION, request),
    completeSession: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS.RUNTIME_COMPLETE_SESSION, request),
    getState: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS.RUNTIME_GET_STATE, request),
    processQuestion: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS.RUNTIME_PROCESS_QUESTION, request),
    submitAnswer: (request: unknown) => ipcRenderer.invoke(IPC_CHANNELS.RUNTIME_SUBMIT_ANSWER, request),
  }),
  platform: Object.freeze({
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.PLATFORM_GET_STATE),
    signIn: (request: { email: string; password: string }) => ipcRenderer.invoke(IPC_CHANNELS.PLATFORM_SIGN_IN, request.email, request.password),
    signOut: () => ipcRenderer.invoke(IPC_CHANNELS.PLATFORM_SIGN_OUT),
    registerDevice: () => ipcRenderer.invoke(IPC_CHANNELS.PLATFORM_REGISTER_DEVICE),
    refreshAccount: () => ipcRenderer.invoke(IPC_CHANNELS.PLATFORM_REFRESH_ACCOUNT),
    browserSignIn: () => ipcRenderer.invoke(IPC_CHANNELS.PLATFORM_BROWSER_SIGN_IN),
    cancelBrowserSignIn: () => ipcRenderer.invoke(IPC_CHANNELS.PLATFORM_CANCEL_BROWSER_SIGN_IN),
    updateProfile: (profile: { displayName?: string; locale?: string }) => ipcRenderer.invoke(IPC_CHANNELS.PLATFORM_UPDATE_PROFILE, profile),
    openWebsite: (destination: "account" | "billing") => ipcRenderer.invoke(IPC_CHANNELS.PLATFORM_OPEN_WEBSITE, destination),
  }),
  overlay: Object.freeze({
    show: (request?: { readonly sessionId?: string }): Promise<{ readonly success: boolean; readonly error?: Error }> =>
      ipcRenderer.invoke(IPC_CHANNELS.OVERLAY_SHOW, request) as Promise<{ readonly success: boolean; readonly error?: Error }>,

    hide: (): Promise<{ readonly success: boolean; readonly error?: Error }> =>
      ipcRenderer.invoke(IPC_CHANNELS.OVERLAY_HIDE) as Promise<{ readonly success: boolean; readonly error?: Error }>,

    toggle: (): Promise<{
      readonly success: boolean;
      readonly data?: { readonly visible: boolean; readonly opacity: number; readonly alwaysOnTop: boolean };
      readonly error?: Error;
    }> =>
      ipcRenderer.invoke(IPC_CHANNELS.OVERLAY_TOGGLE) as Promise<{
        readonly success: boolean;
        readonly data?: { readonly visible: boolean; readonly opacity: number; readonly alwaysOnTop: boolean };
        readonly error?: Error;
      }>,

    getState: (): Promise<{
      readonly success: boolean;
      readonly data?: {
        readonly visible: boolean;
        readonly opacity: number;
        readonly alwaysOnTop: boolean;
        readonly x?: number;
        readonly y?: number;
        readonly width?: number;
        readonly height?: number;
      };
      readonly error?: Error;
    }> =>
      ipcRenderer.invoke("overlay:get-state") as Promise<{
        readonly success: boolean;
        readonly data?: {
          readonly visible: boolean;
          readonly opacity: number;
          readonly alwaysOnTop: boolean;
          readonly x?: number;
          readonly y?: number;
          readonly width?: number;
          readonly height?: number;
        };
        readonly error?: Error;
      }>,

    setOpacity: (opacity: number): Promise<{ readonly success: boolean; readonly error?: Error }> =>
      ipcRenderer.invoke(IPC_CHANNELS.OVERLAY_UPDATE, { opacity }) as Promise<{ readonly success: boolean; readonly error?: Error }>,

    setAlwaysOnTop: (alwaysOnTop: boolean): Promise<{ readonly success: boolean; readonly error?: Error }> =>
      ipcRenderer.invoke(IPC_CHANNELS.OVERLAY_UPDATE, { alwaysOnTop }) as Promise<{ readonly success: boolean; readonly error?: Error }>,

    setPosition: (x: number, y: number): Promise<{ readonly success: boolean; readonly error?: Error }> =>
      ipcRenderer.invoke(IPC_CHANNELS.OVERLAY_UPDATE, { x, y }) as Promise<{ readonly success: boolean; readonly error?: Error }>,

    setSize: (width: number, height: number): Promise<{ readonly success: boolean; readonly error?: Error }> =>
      ipcRenderer.invoke(IPC_CHANNELS.OVERLAY_UPDATE, { width, height }) as Promise<{ readonly success: boolean; readonly error?: Error }>,
  }),
  updater: Object.freeze({
    checkForUpdates: async (force?: boolean): Promise<{ readonly success: boolean; readonly data?: { readonly hasUpdate: boolean; readonly latestVersion: string; readonly currentVersion: string; readonly releaseNotes?: string; readonly releaseDate?: string; readonly downloadUrl?: string; readonly sizeBytes?: number; readonly sha256?: string }; readonly error?: string }> => {
      const request: UpdaterCheckRequest = force ? { force: true } : {};
      return ipcRenderer.invoke(UPDATER_IPC_CHANNELS.CHECK_FOR_UPDATES, request) as Promise<{ readonly success: boolean; readonly data?: { readonly hasUpdate: boolean; readonly latestVersion: string; readonly currentVersion: string; readonly releaseNotes?: string; readonly releaseDate?: string; readonly downloadUrl?: string; readonly sizeBytes?: number; readonly sha256?: string }; readonly error?: string }>;
    },
    downloadUpdate: async (version?: string): Promise<{ readonly success: boolean; readonly error?: string }> => {
      const request: UpdaterDownloadRequest = version ? { version } : {};
      return ipcRenderer.invoke(UPDATER_IPC_CHANNELS.DOWNLOAD_UPDATE, request) as Promise<{ readonly success: boolean; readonly error?: string }>;
    },
    installUpdate: async (restartNow?: boolean): Promise<{ readonly success: boolean; readonly error?: string }> => {
      const request: UpdaterInstallRequest = restartNow ? { restartNow } : {};
      return ipcRenderer.invoke(UPDATER_IPC_CHANNELS.INSTALL_UPDATE, request) as Promise<{ readonly success: boolean; readonly error?: string }>;
    },
    getStatus: async (): Promise<UpdaterStatus> => {
      return ipcRenderer.invoke(UPDATER_IPC_CHANNELS.GET_STATUS) as Promise<UpdaterStatus>;
    },
    setChannel: async (channel: UpdateChannel): Promise<{ readonly success: boolean; readonly error?: string }> => {
      const request: UpdaterSetChannelRequest = { channel };
      return ipcRenderer.invoke(UPDATER_IPC_CHANNELS.SET_CHANNEL, request) as Promise<{ readonly success: boolean; readonly error?: string }>;
    },
    setAutoCheck: async (enabled: boolean): Promise<{ readonly success: boolean; readonly error?: string }> => {
      const request: UpdaterSetAutoCheckRequest = { enabled };
      return ipcRenderer.invoke(UPDATER_IPC_CHANNELS.SET_AUTO_CHECK, request) as Promise<{ readonly success: boolean; readonly error?: string }>;
    },
    onProgress: (callback: (progress: UpdaterProgressPayload) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: UpdaterProgressPayload) => callback(progress);
      ipcRenderer.on(UPDATER_IPC_CHANNELS.ON_DOWNLOAD_PROGRESS, listener);
      return () => ipcRenderer.removeListener(UPDATER_IPC_CHANNELS.ON_DOWNLOAD_PROGRESS, listener);
    },
    onStateChange: (callback: (status: UpdaterStatus) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: UpdaterStatus) => callback(status);
      ipcRenderer.on(UPDATER_IPC_CHANNELS.ON_STATE_CHANGE, listener);
      return () => ipcRenderer.removeListener(UPDATER_IPC_CHANNELS.ON_STATE_CHANGE, listener);
    },
  }),
  audio: Object.freeze(audioApi),
  audioRuntime: Object.freeze(audioRuntimeApi),
});
