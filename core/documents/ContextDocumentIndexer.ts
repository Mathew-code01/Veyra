// ============================================================================
// FILE: core/documents/ContextDocumentIndexer.ts
//
// PURPOSE:
// Production adapter between core/documents and core/context.
//
// RESPONSIBILITY:
//
//   ProcessedDocument + IndexBatch
//              ↓
//       document → generic Context
//              ↓
//       prepared Context chunks
//              ↓
//         ContextManager
//
// IMPORTANT:
// This adapter intentionally lives inside core/documents because it translates
// document-domain concepts into generic Context-domain concepts.
//
// DEPENDENCY DIRECTION:
//
//   core/documents
//          │
//          ▼
//   core/context
//
// NEVER:
//
//   core/context
//          │
//          X
//   core/documents
//
// Documents have already completed:
//
//   validation
//   classification
//   parsing
//   normalization
//   structural chunking
//   index preparation
//
// Therefore this adapter MUST NOT perform another parsing/chunking pass.
// ============================================================================

import type { Chunk, ChunkMetadata } from "../context/ingestion/Chunker";

import type { ContextManager } from "../context/ContextManager";

import type {
  ContextContentType,
  ContextItem,
  ContextSource,
  ContextSourceType,
} from "../context/contracts/ContextTypes";

import type { ProcessedDocument } from "./DocumentTypes";

import type { IndexBatch, IndexDocument } from "./indexing/IndexDocument";

import type {
  DocumentContextIndexOptions,
  DocumentContextSink,
} from "./DocumentContextSink";

// ============================================================================
// ADAPTER
// ============================================================================

export class ContextDocumentIndexer implements DocumentContextSink {
  public constructor(private readonly contextManager: ContextManager) {
    if (!contextManager) {
      throw new Error("ContextDocumentIndexer requires a ContextManager.");
    }
  }

  // ==========================================================================
  // INDEX
  // ==========================================================================

  /**
   * Publishes a processed document into generic Context.
   *
   * The canonical document chunks from IndexBatch are preserved.
   *
   * ContextManager.indexPreparedContext() does NOT rechunk them.
   */
  public async index(
    document: ProcessedDocument,
    batch: IndexBatch,
    options: DocumentContextIndexOptions = {},
  ): Promise<void> {
    this.validateDocument(document);

    this.validateBatch(document, batch);

    this.throwIfAborted(options.signal);

    const context = this.toContext(document);

    const chunks = batch.documents.map((indexDocument, index) =>
      this.toContextChunk(indexDocument, document, index),
    );

    this.throwIfAborted(options.signal);

    await this.contextManager.indexPreparedContext(context, chunks, {
      signal: options.signal,
    });

    this.throwIfAborted(options.signal);
  }

  // ==========================================================================
  // REMOVE
  // ==========================================================================

  /**
   * Removes all Context/vector records belonging to the document.
   */
  public async remove(
    documentId: string,
    options: DocumentContextIndexOptions = {},
  ): Promise<void> {
    const normalizedDocumentId = documentId?.trim();

    if (!normalizedDocumentId) {
      throw new Error(
        "A document ID is required when removing document context.",
      );
    }

    this.throwIfAborted(options.signal);

    await this.contextManager.remove(normalizedDocumentId, {
      signal: options.signal,
    });

    this.throwIfAborted(options.signal);
  }

  // ==========================================================================
  // DOCUMENT → CONTEXT
  // ==========================================================================

  private toContext(document: ProcessedDocument): ContextItem {
    const documentId = document.identity.id.trim();

    const documentName =
      document.metadata.title?.trim() ||
      document.metadata.filename?.trim() ||
      document.identity.filename?.trim() ||
      documentId;

    /**
     * Document format and Context semantic content type are different
     * concepts.
     *
     * PDF/DOCX/TXT/etc. describe the physical document format.
     *
     * ContextContentType describes the meaning of the information.
     *
     * At this generic adapter boundary we therefore default to "generic"
     * unless a semantic type has been explicitly provided in metadata.
     */
    const contextContentType = resolveContentType(document);

    const sourceType: ContextSourceType = "document";

    const source: ContextSource = {
      type: sourceType,

      id: documentId,

      name: documentName,

      metadata: {
        documentFormat: document.type,

        mimeType: document.metadata.mimeType,

        filename: document.metadata.filename,

        checksum: document.metadata.checksum,
      },
    };

    return {
      id: documentId,

      name: documentName,

      contentType: contextContentType,

      source,

      /**
       * Preserve document-specific information as generic Context metadata.
       *
       * Context does not interpret these fields.
       */
      metadata: {
        ...document.metadata,

        documentId,

        documentFormat: document.type,

        documentName,

        fileName: document.metadata.filename ?? document.identity.filename,

        mimeType: document.metadata.mimeType,

        contextSource: sourceType,
      },

      text: document.text,

      createdAt: resolveCreatedAt(document),

      updatedAt: resolveUpdatedAt(document),
    };
  }

  // ==========================================================================
  // INDEX CHUNK → CONTEXT CHUNK
  // ==========================================================================

  private toContextChunk(
    indexDocument: IndexDocument,
    document: ProcessedDocument,
    fallbackIndex: number,
  ): Chunk {
    const documentId = document.identity.id.trim();

    const documentName =
      document.metadata.title?.trim() ||
      document.metadata.filename?.trim() ||
      document.identity.filename?.trim() ||
      documentId;

    const chunkIndex = isValidNonNegativeSafeInteger(
      indexDocument.metadata.chunkIndex,
    )
      ? indexDocument.metadata.chunkIndex
      : fallbackIndex;

    const startOffset = isValidNonNegativeSafeInteger(
      indexDocument.metadata.startOffset,
    )
      ? indexDocument.metadata.startOffset
      : 0;

    const endOffset =
      isValidNonNegativeSafeInteger(indexDocument.metadata.endOffset) &&
      indexDocument.metadata.endOffset >= startOffset
        ? indexDocument.metadata.endOffset
        : startOffset + indexDocument.text.length;

    const tokenEstimate = isValidTokenEstimate(
      indexDocument.metadata.tokenEstimate,
    )
      ? indexDocument.metadata.tokenEstimate
      : estimateTokens(indexDocument.text);

    const contentType = resolveContentType(document);

    const metadata: ChunkMetadata = {
      /**
       * Preserve all canonical document index metadata.
       *
       * Context treats it as opaque provenance.
       */
      ...indexDocument.metadata,

      contextId: documentId,

      sourceType: "document",

      sourceId: documentId,

      sourceName: documentName,

      contentType,

      chunkIndex,

      startOffset,

      endOffset,

      characterCount: indexDocument.text.length,

      tokenEstimate,
    };

    return {
      id: indexDocument.id,

      contextId: documentId,

      text: indexDocument.text,

      metadata,
    };
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  private validateDocument(document: ProcessedDocument): void {
    if (!document) {
      throw new Error("A processed document is required for Context indexing.");
    }

    const documentId = document.identity?.id?.trim();

    if (!documentId) {
      throw new Error("A processed document must have a non-empty ID.");
    }

    if (typeof document.text !== "string") {
      throw new Error(`Processed document "${documentId}" must contain text.`);
    }

    if (!document.text.trim()) {
      throw new Error(
        `Processed document "${documentId}" contains no usable text.`,
      );
    }
  }

  private validateBatch(document: ProcessedDocument, batch: IndexBatch): void {
    if (!batch) {
      throw new Error("An index batch is required for Context indexing.");
    }

    const documentId = document.identity.id.trim();

    if (batch.documentId !== documentId) {
      throw new Error(
        `Context index batch belongs to document "${batch.documentId}", ` +
          `expected "${documentId}".`,
      );
    }

    const seenIds = new Set<string>();

    for (const item of batch.documents) {
      if (!item) {
        throw new Error(
          `Context index batch for document "${documentId}" contains an invalid record.`,
        );
      }

      if (!item.id?.trim()) {
        throw new Error(
          `Context index batch for document "${documentId}" contains a record without an ID.`,
        );
      }

      if (item.documentId !== documentId) {
        throw new Error(
          `Context index record "${item.id}" belongs to document "${item.documentId}", ` +
            `expected "${documentId}".`,
        );
      }

      if (typeof item.text !== "string") {
        throw new Error(`Context index record "${item.id}" must contain text.`);
      }

      if (!item.text.trim()) {
        throw new Error(
          `Context index record "${item.id}" contains no usable text.`,
        );
      }

      if (seenIds.has(item.id)) {
        throw new Error(
          `Context index batch contains duplicate chunk ID "${item.id}".`,
        );
      }

      seenIds.add(item.id);
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
      : new Error("Document-to-Context indexing was cancelled.");
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Resolve semantic Context content type without making Context understand
 * document-domain enums.
 *
 * If the document pipeline already placed a semantic type into metadata,
 * preserve it. Otherwise use "generic".
 */
function resolveContentType(document: ProcessedDocument): ContextContentType {
  const metadata = document.metadata as Record<string, unknown> | undefined;

  const candidateValues = [
    metadata?.contextContentType,
    metadata?.contentType,
    metadata?.semanticType,
  ];

  for (const candidate of candidateValues) {
    if (typeof candidate === "string" && isContextContentType(candidate)) {
      return candidate;
    }
  }

  return "generic";
}

function isContextContentType(value: string): value is ContextContentType {
  return (
    value === "resume" ||
    value === "cover-letter" ||
    value === "job-description" ||
    value === "project" ||
    value === "experience" ||
    value === "skills" ||
    value === "story" ||
    value === "company-research" ||
    value === "education" ||
    value === "certification" ||
    value === "conversation" ||
    value === "transcript" ||
    value === "question" ||
    value === "answer" ||
    value === "visual-observation" ||
    value === "visual-text" ||
    value === "visual-object" ||
    value === "web-result" ||
    value === "tool-result" ||
    value === "memory" ||
    value === "generated" ||
    value === "application-state" ||
    value === "generic"
  );
}

function isValidNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isValidTokenEstimate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function estimateTokens(text: string): number {
  const normalized = text.trim();

  if (!normalized) {
    return 0;
  }

  return Math.max(1, Math.ceil(normalized.length / 4));
}

function resolveCreatedAt(document: ProcessedDocument): string {
  const metadata = document.metadata as Record<string, unknown> | undefined;

  const candidate = metadata?.createdAt;

  return typeof candidate === "string" && candidate.trim()
    ? candidate
    : new Date().toISOString();
}

function resolveUpdatedAt(document: ProcessedDocument): string {
  const metadata = document.metadata as Record<string, unknown> | undefined;

  const candidate = metadata?.updatedAt;

  return typeof candidate === "string" && candidate.trim()
    ? candidate
    : new Date().toISOString();
}
