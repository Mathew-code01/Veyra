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
  DocumentReadRequest,
  DocumentDeleteRequest,
  DocumentPickRequest,
} from "../ipc/document.ipc";

import type {
  MemorySearchRequest,
  MemoryListRequest,
  MemoryCreateRequest,
  MemoryUpdateRequest,
  MemoryDeleteRequest,
} from "../ipc/memory.ipc";

import type {
  InterviewAnalysisResult,
  InterviewTaskResult,
  InterviewExecuteAIResult,
} from "../../shared/contracts/interview.contract";

import type {
  InterviewAnalysisRequest,
  InterviewTaskRequest,
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
}

/**
 * Document API exposed to the renderer.
 */
export interface VeyraDocumentApi {
  /**
   * Open an authorized file picker and return selected file paths.
   *
   * The renderer never receives direct filesystem access.
   */
  pick(
    request?: DocumentPickRequest,
  ): Promise<{
    readonly success: boolean;

    readonly data?: {
      readonly filePaths: readonly string[];
    };

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

    readonly data?: unknown;

    readonly error?: Error;
  }>;

  /**
   * Return the stored processed document by ID.
   */
  read(
    request: DocumentReadRequest,
  ): Promise<{
    readonly success: boolean;

    readonly data?: unknown;

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

    readonly data?: readonly unknown[];

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
 */
declare global {
  interface Window {
    readonly veyra: VeyraDesktopAPI;
  }
}

export {};