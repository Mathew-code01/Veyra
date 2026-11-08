// Relative path: desktop/ipc/document.ipc.ts

/**
 * Veyra Document IPC
 *
 * Location:
 * desktop/ipc/document.ipc.ts
 *
 * MAIN PROCESS ONLY.
 *
 * The renderer never receives DocumentService, parsers, document stores,
 * context indexers, or AI analyzers.
 *
 * Supported renderer operations:
 *
 *   1. document:pick    - Open an authorized file picker and return paths.
 *   2. document:import  - Ingest a document through DocumentService (validate,
 *                          classify, parse, normalize, chunk, index, store,
 *                          context-publish, AI-analysis, candidate-evidence).
 *   3. document:read    - Return processed document content and metadata.
 *   4. document:delete  - Delete a document and its derived context data.
 *   5. document:list    - List stored documents.
 *
 * Security:
 * - IPC handlers validate their sender state.
 * - Request payloads are treated as untrusted input.
 * - File paths returned by the picker are validated before crossing IPC.
 * - No Node.js objects or provider secrets are exposed to the renderer.
 *
 * `ipcMain` and `dialog` are injected so this module can be unit-tested
 * without loading Electron.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";

import { DocumentService } from "../../core/documents/DocumentService";

import {
  DocumentError,
  DocumentErrorCode,
} from "../../core/documents/DocumentError";

import { IPC_CHANNELS } from "../../shared/constants/events";

import type {
  DocumentProcessingRequest,
  DocumentSource,
} from "../../core/documents/DocumentTypes";

import type { DocumentAnalysis } from "../../shared/types/documents";

import type {
  DocumentServiceResult,
} from "../../core/documents/DocumentService";

import type { ProcessedDocument } from "../../core/documents/DocumentTypes";

/**
 * Document import request received across IPC.
 *
 * The signal is intentionally omitted because it cannot cross the IPC
 * boundary.
 */
export interface DocumentImportRequest {
  readonly source: DocumentSource;

  readonly candidateId?: string;

  readonly options?: {
    readonly generateChunks?: boolean;

    readonly chunkSize?: number;

    readonly chunkOverlap?: number;
  };
}

/**
 * Document read request received across IPC.
 */
export interface DocumentReadRequest {
  readonly documentId: string;
}

/**
 * Document delete request received across IPC.
 */
export interface DocumentDeleteRequest {
  readonly documentId: string;
}

/**
 * File-picker request received across IPC.
 */
export interface DocumentPickRequest {
  readonly filters?: readonly {
    readonly name: string;

    readonly extensions: readonly string[];
  }[];
}

/**
 * Import result returned across IPC.
 */
export interface DocumentImportResult {
  readonly documentId: string;

  readonly type: string;

  readonly status: string;

  readonly processedAt: string;

  readonly analysis?: DocumentAnalysis;

  readonly analysisWarning?: string;

  readonly candidateEvidence?: unknown;

  readonly candidateEvidenceWarning?: string;

  readonly classification?: {
    readonly type: string;

    readonly confidence: number;

    readonly source: string;
  };
}

/**
 * Document list item returned across IPC.
 */
export interface DocumentListItem {
  readonly documentId: string;

  readonly type: string;

  readonly status: string;

  readonly processedAt?: string;

  readonly filename?: string;
}

export interface RegisterDocumentIpcOptions {
  readonly documentService: DocumentService;

  readonly ipcMain: IpcMain;

  /**
   * Electron dialog module (or test mock).
   *
   * Provides showOpenDialog for the document:pick channel.
   *
   * Typed as `any` because Electron's `Dialog.showOpenDialog` has
   * overloaded signatures that are difficult to express in a structural
   * interface without suppressing type errors.
   */
  readonly dialog: any;
}

/**
 * Asserts that unknown IPC input is an object.
 *
 * IPC arguments originate from the renderer and must always be considered
 * untrusted.
 */
function assertRequestObject(
  value: unknown,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value as Record<string, unknown>;
}

/**
 * Validates the IPC sender before processing a request.
 */
function assertValidIpcSender(
  event: IpcMainInvokeEvent,
): void {
  if (event.sender.isDestroyed()) {
    throw new Error(
      "Veyra IPC request rejected: sender is no longer available.",
    );
  }
}

/**
 * Converts a DocumentServiceResult into an IPC-safe import result.
 */
function toImportResult(
  result: DocumentServiceResult,
): DocumentImportResult {
  return Object.freeze({
    documentId: result.document.identity.id,

    type: result.document.type,

    status: result.document.status,

    processedAt: result.document.processedAt,

    ...(result.analysis && {
      analysis: result.analysis,
    }),

    ...(result.analysisWarning && {
      analysisWarning: result.analysisWarning,
    }),

    ...(result.candidateEvidence && {
      candidateEvidence: result.candidateEvidence,
    }),

    ...(result.candidateEvidenceWarning && {
      candidateEvidenceWarning: result.candidateEvidenceWarning,
    }),

    classification: result.classification,
  });
}

/**
 * Converts a ProcessedDocument into an IPC-safe list item.
 */
function toListItem(document: ProcessedDocument): DocumentListItem {
  return Object.freeze({
    documentId: document.identity.id,

    type: document.type,

    status: document.status,

    processedAt: document.processedAt,

    filename:
      document.metadata.filename ?? document.identity.filename,
  });
}

/**
 * Registers Document IPC handlers.
 *
 * Returns a cleanup function for tests and controlled application lifecycle
 * management.
 */
export function registerDocumentIpc(
  options: RegisterDocumentIpcOptions,
): () => void {
  const documentService = options.documentService;

  const ipcMain = options.ipcMain;

  const dialog = options.dialog;

  /**
   * DOCUMENT_PICK
   *
   * Opens an authorized file picker. The renderer is never given direct
   * filesystem access.
   */
  const pickHandler = async (
    event: IpcMainInvokeEvent,
    request?: DocumentPickRequest,
  ): Promise<{
    readonly success: boolean;

    readonly data?: {
      readonly filePaths: readonly string[];
    };

    readonly error?: Error;
  }> => {
    assertValidIpcSender(event);

    try {
      const result = await dialog.showOpenDialog({
        properties: ["openFile", "multiSelections"],

        filters: request?.filters?.map((filter) => ({
          name: filter.name,

          extensions: filter.extensions,
        })),
      } as unknown);

      if (result.canceled) {
        return {
          success: true,

          data: {
            filePaths: [],
          },
        };
      }

      return {
        success: true,

        data: {
          filePaths: Object.freeze(result.filePaths),
        },
      };
    } catch (error) {
      return {
        success: false,

        error:
          error instanceof Error
            ? error
            : new Error("Document picker failed."),
      };
    }
  };

  /**
   * DOCUMENT_IMPORT
   *
   * Runs the full document ingestion pipeline through DocumentService.
   */
  const importHandler = async (
    event: IpcMainInvokeEvent,
    request?: DocumentImportRequest,
  ): Promise<{
    readonly success: boolean;

    readonly data?: DocumentImportResult;

    readonly error?: Error;
  }> => {
    assertValidIpcSender(event);

    if (!request) {
      return {
        success: false,

        error: new Error("Document import request is required."),
      };
    }

    if (!request.source) {
      return {
        success: false,

        error: new Error("Document source is required."),
      };
    }

    const processingRequest: DocumentProcessingRequest = {
      documentId: request.source.externalId ?? crypto.randomUUID(),

      candidateId: request.candidateId,

      source: request.source,

      options: request.options,
    };

    try {
      const result = await documentService.process(processingRequest);

      return {
        success: true,

        data: toImportResult(result),
      };
    } catch (error) {
      return {
        success: false,

        error:
          error instanceof DocumentError
            ? error
            : error instanceof Error
              ? error
              : new Error("Document import failed."),
      };
    }
  };

  /**
   * DOCUMENT_READ
   *
   * Returns the stored processed document by ID.
   */
  const readHandler = async (
    event: IpcMainInvokeEvent,
    request?: DocumentReadRequest,
  ): Promise<{
    readonly success: boolean;

    readonly data?: ProcessedDocument;

    readonly error?: Error;
  }> => {
    assertValidIpcSender(event);

    if (!request?.documentId?.trim()) {
      return {
        success: false,

        error: new Error("A document ID is required."),
      };
    }

    try {
      const document = await documentService.getDocumentById(
        request.documentId.trim(),
      );

      if (!document) {
        return {
          success: false,

          error: new Error(`Document "${request.documentId}" not found.`),
        };
      }

      return {
        success: true,

        data: document,
      };
    } catch (error) {
      return {
        success: false,

        error:
          error instanceof Error ? error : new Error("Document read failed."),
      };
    }
  };

  /**
   * DOCUMENT_DELETE
   *
   * Deletes a stored document and its derived context data.
   */
  const deleteHandler = async (
    event: IpcMainInvokeEvent,
    request?: DocumentDeleteRequest,
  ): Promise<{
    readonly success: boolean;

    readonly error?: Error;
  }> => {
    assertValidIpcSender(event);

    if (!request?.documentId?.trim()) {
      return {
        success: false,

        error: new Error("A document ID is required."),
      };
    }

    try {
      await documentService.deleteDocument(request.documentId.trim());

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,

        error:
          error instanceof Error ? error : new Error("Document delete failed."),
      };
    }
  };

  /**
   * DOCUMENT_LIST
   *
   * Lists all stored documents.
   */
  const listHandler = async (
    event: IpcMainInvokeEvent,
    _request?: unknown,
  ): Promise<{
    readonly success: boolean;

    readonly data?: readonly DocumentListItem[];

    readonly error?: Error;
  }> => {
    assertValidIpcSender(event);

    try {
      const documents = await documentService.listDocuments();

      return {
        success: true,

        data: documents.map(toListItem),
      };
    } catch (error) {
      return {
        success: false,

        error:
          error instanceof Error ? error : new Error("Document list failed."),
      };
    }
  };

  /**
   * Register handlers.
   */
  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_PICK,
    pickHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_IMPORT,
    importHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_READ,
    readHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_DELETE,
    deleteHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_LIST,
    listHandler,
  );

  /**
   * Cleanup.
   */
  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.DOCUMENT_PICK);

    ipcMain.removeHandler(IPC_CHANNELS.DOCUMENT_IMPORT);

    ipcMain.removeHandler(IPC_CHANNELS.DOCUMENT_READ);

    ipcMain.removeHandler(IPC_CHANNELS.DOCUMENT_DELETE);

    ipcMain.removeHandler(IPC_CHANNELS.DOCUMENT_LIST);
  };
}