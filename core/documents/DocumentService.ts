// ============================================================================
// FILE: core/documents/DocumentService.ts
//
// PURPOSE:
// Public application service for the document subsystem.
//
// RESPONSIBILITY:
// Coordinates document ingestion from source -> processed document and,
// when configured, semantic AI analysis of the completed document.
//
// DETERMINISTIC PIPELINE:
//
//   validate
//      ↓
//   classify
//      ↓
//   parse
//      ↓
//   normalize
//      ↓
//   chunk
//      ↓
//   index preparation
//      ↓
//   storage
//      ↓
//   optional context publishing
//
// OPTIONAL AI ENRICHMENT:
//
//   ProcessedDocument
//        ↓
//   DocumentAIAnalyzer
//        ↓
//   AIManagerDocumentAnalyzer
//        ↓
//   AIManager
//        ↓
//   Local / Cloud AI provider
//        ↓
//   DocumentAnalysis
//
// IMPORTANT ARCHITECTURE:
//
// DocumentService does NOT:
//   - depend directly on AIManager
//   - depend directly on LocalModelProvider
//   - depend directly on CloudAIProvider
//   - call LLM SDKs
//   - generate embeddings directly
//   - perform retrieval
//   - query vector databases
//   - perform AI reasoning itself
//   - depend directly on ContextManager
//
// AI is connected through the DocumentAIAnalyzer port.
//
// Context publishing is performed through the injected
// DocumentContextSink boundary.
//
// Dependency direction:
//
//   Documents
//       ↓
//   DocumentAIAnalyzer
//       ↓
//   AI execution
//
// rather than:
//
//   Documents
//       ↓
//   AIManager
//       ↓
//   Documents
//
// ============================================================================

import { DocumentError, DocumentErrorCode } from "./DocumentError";

import {
  DocumentProcessingStage,
  DocumentProcessingStatus,
  DocumentType,
  type DocumentChunk,
  type DocumentProcessingProgress,
  type DocumentProcessingRequest,
  type DocumentSource,
  type NormalizedDocument,
  type ParsedDocument,
  type ProcessedDocument,
} from "./DocumentTypes";

import {
  DocumentValidator,
  type DocumentValidationResult,
} from "./validation/DocumentValidator";

import { DocumentClassifier } from "./classification/DocumentClassifier";

import { DocumentNormalizer } from "./normalization/DocumentNormalizer";

import {
  DocumentChunker,
  type DocumentChunkerOptions,
} from "./chunking/DocumentChunker";

import {
  DocumentIndexer,
  type DocumentIndexingOptions,
} from "./indexing/DocumentIndexer";

import type { IndexBatch } from "./indexing/IndexDocument";

import type { DocumentStore } from "./storage/DocumentStore";

import type { DocumentContextSink } from "./DocumentContextSink";

import type {
  DocumentAIAnalyzer,
  DocumentAIAnalyzerOptions,
} from "./analysis/DocumentAIAnalyzer";

import type { DocumentAnalysis } from "../../shared/types/documents";

// ============================================================================
// PARSER CONTRACT
// ============================================================================

/**
 * Parser contract used by the document service.
 *
 * Individual parsers are intentionally injected.
 *
 * This prevents DocumentService from depending directly on:
 *
 * - PDF libraries
 * - DOCX libraries
 * - HTML parsers
 * - Markdown parsers
 * - etc.
 */
export interface DocumentParserAdapter {
  readonly type: DocumentType;

  parse(
    source: DocumentSource,
    options?: {
      readonly signal?: AbortSignal;
    },
  ): Promise<ParsedDocument>;
}

// ============================================================================
// PARSER REGISTRY
// ============================================================================

/**
 * Registry for document parsers.
 */
export interface DocumentParserRegistry {
  register(parser: DocumentParserAdapter): void;

  resolve(type: DocumentType): DocumentParserAdapter | undefined;
}

/**
 * Simple in-process parser registry.
 */
export class DefaultDocumentParserRegistry implements DocumentParserRegistry {
  private readonly parsers = new Map<DocumentType, DocumentParserAdapter>();

  public constructor(parsers: readonly DocumentParserAdapter[] = []) {
    for (const parser of parsers) {
      this.register(parser);
    }
  }

  public register(parser: DocumentParserAdapter): void {
    if (!parser) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "A document parser is required.",
      );
    }

    if (!parser.type) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "Document parser type is required.",
      );
    }

    if (this.parsers.has(parser.type)) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        `A parser is already registered for document type "${parser.type}".`,
      );
    }

    this.parsers.set(parser.type, parser);
  }

  public resolve(type: DocumentType): DocumentParserAdapter | undefined {
    return this.parsers.get(type);
  }
}

// ============================================================================
// INDEX SINK
// ============================================================================

/**
 * Optional index sink.
 *
 * DocumentIndexer creates an index-neutral batch.
 *
 * A database/vector-store adapter can consume this later.
 */
export interface DocumentIndexSink {
  write(
    batch: IndexBatch,
    options?: {
      readonly signal?: AbortSignal;
    },
  ): Promise<void>;
}

// ============================================================================
// DOCUMENT AI ANALYSIS DEPENDENCIES
// ============================================================================

/**
 * Configuration for optional semantic document analysis.
 *
 * The analyzer is intentionally an abstraction.
 *
 * DocumentService therefore does not know whether analysis is performed by:
 *
 * - Ollama
 * - llama.cpp
 * - Gemini
 * - Mistral
 * - another cloud provider
 * - a mock provider
 *
 * Provider/model selection remains outside DocumentService and is supplied
 * through DocumentAIAnalyzerOptions.
 */
export interface DocumentAIAnalysisDependencies {
  /**
   * Adapter responsible for translating document analysis into the
   * application's AI execution contract.
   */
  readonly analyzer: DocumentAIAnalyzer;

  /**
   * Provider/model and analysis limits.
   */
  readonly options: DocumentAIAnalyzerOptions;

  /**
   * When false or omitted:
   *
   *   document ingestion succeeds even if AI enrichment fails.
   *
   * When true:
   *
   *   AI analysis is part of the required document workflow and an
   *   analysis failure fails the overall document operation.
   *
   * Recommended default: false.
   */
  readonly required?: boolean;
}

// ============================================================================
// SERVICE DEPENDENCIES
// ============================================================================

export interface DocumentServiceDependencies {
  readonly validator?: DocumentValidator;

  readonly classifier?: DocumentClassifier;

  readonly parserRegistry: DocumentParserRegistry;

  readonly normalizer?: DocumentNormalizer;

  readonly chunker?: DocumentChunker;

  readonly indexer?: DocumentIndexer;

  readonly documentStore?: DocumentStore;

  readonly indexSink?: DocumentIndexSink;

  /**
   * Optional bridge into the generic context subsystem.
   *
   * DocumentService only knows the document-side port.
   *
   * The concrete implementation can be:
   *
   *   ContextDocumentIndexer
   */
  readonly contextSink?: DocumentContextSink;

  /**
   * Optional semantic AI analysis.
   *
   * This is the document -> AI connection.
   *
   * DocumentService depends on DocumentAIAnalyzer only.
   *
   * A typical composition-root implementation is:
   *
   *   new AIManagerDocumentAnalyzer(aiManager)
   *
   * injected here.
   */
  readonly aiAnalysis?: DocumentAIAnalysisDependencies;
}

// ============================================================================
// SERVICE RESULT
// ============================================================================

export interface DocumentServiceResult {
  readonly document: ProcessedDocument;

  readonly indexBatch: IndexBatch;

  readonly validation: DocumentValidationResult;

  readonly classification: {
    readonly type: DocumentType;

    readonly confidence: number;

    readonly source: "mime" | "extension" | "content" | "fallback";

    readonly warnings: readonly string[];
  };

  /**
   * Semantic analysis generated from the processed document.
   *
   * Undefined means:
   *
   * - AI analysis was not configured, or
   * - optional AI analysis failed and ingestion continued.
   */
  readonly analysis?: DocumentAnalysis;

  /**
   * Indicates that AI analysis was attempted but failed while remaining
   * non-fatal to document ingestion.
   */
  readonly analysisWarning?: string;
}

// ============================================================================
// DOCUMENT SERVICE
// ============================================================================

/**
 * Canonical document application service.
 */
export class DocumentService {
  private readonly validator: DocumentValidator;

  private readonly classifier: DocumentClassifier;

  private readonly parserRegistry: DocumentParserRegistry;

  private readonly normalizer: DocumentNormalizer;

  private readonly chunker: DocumentChunker;

  private readonly indexer: DocumentIndexer;

  private readonly documentStore?: DocumentStore;

  private readonly indexSink?: DocumentIndexSink;

  private readonly contextSink?: DocumentContextSink;

  /**
   * Optional semantic AI boundary.
   *
   * IMPORTANT:
   *
   * This is deliberately NOT AIManager.
   *
   * The document subsystem only knows that an analyzer can analyze a
   * ProcessedDocument.
   */
  private readonly aiAnalysis?: DocumentAIAnalysisDependencies;

  // --------------------------------------------------------------------------
  // CONSTRUCTOR
  // --------------------------------------------------------------------------

  public constructor(dependencies: DocumentServiceDependencies) {
    if (!dependencies) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "DocumentService dependencies are required.",
      );
    }

    if (!dependencies.parserRegistry) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "Document parser registry is required.",
      );
    }

    this.validator = dependencies.validator ?? new DocumentValidator();

    this.classifier = dependencies.classifier ?? new DocumentClassifier();

    this.parserRegistry = dependencies.parserRegistry;

    this.normalizer = dependencies.normalizer ?? new DocumentNormalizer();

    this.chunker = dependencies.chunker ?? new DocumentChunker();

    this.indexer = dependencies.indexer ?? new DocumentIndexer();

    this.documentStore = dependencies.documentStore;

    this.indexSink = dependencies.indexSink;

    this.contextSink = dependencies.contextSink;

    this.aiAnalysis = dependencies.aiAnalysis;

    if (this.aiAnalysis && !this.aiAnalysis.analyzer) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "Document AI analyzer is required when AI analysis is configured.",
      );
    }

    if (this.aiAnalysis && !this.aiAnalysis.options) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "Document AI analysis options are required when AI analysis is configured.",
      );
    }
  }

  // ==========================================================================
  // PROCESS
  // ==========================================================================

  /**
   * Processes a document from source to ProcessedDocument.
   *
   * When semantic AI analysis is configured, the completed ProcessedDocument
   * is passed through DocumentAIAnalyzer after deterministic ingestion.
   */
  public async process(
    request: DocumentProcessingRequest,
  ): Promise<DocumentServiceResult> {
    const startedAt = new Date();

    this.validateRequest(request);

    const signal = request.options?.signal;

    this.throwIfAborted(signal);

    // ------------------------------------------------------------------------
    // 1. VALIDATION
    // ------------------------------------------------------------------------

    this.emitProgress(
      request,
      DocumentProcessingStage.VALIDATION,
      DocumentProcessingStatus.VALIDATING,
      0,
      "Validating document.",
    );

    let validation: DocumentValidationResult;

    try {
      validation = this.validator.validate(request.source, request.options);
    } catch (error) {
      throw DocumentError.from(
        error,
        DocumentErrorCode.SECURITY_VALIDATION_FAILED,
        this.errorDetails(request.source, DocumentProcessingStage.VALIDATION),
      );
    }

    if (!validation.valid) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "Document validation failed.",
        {
          ...this.errorDetails(
            request.source,
            DocumentProcessingStage.VALIDATION,
          ),

          metadata: {
            warnings: validation.warnings,
          },
        },
      );
    }

    this.throwIfAborted(signal);

    this.emitProgress(
      request,
      DocumentProcessingStage.VALIDATION,
      DocumentProcessingStatus.VALIDATING,
      1,
      "Document validation completed.",
    );

    // ------------------------------------------------------------------------
    // 2. CLASSIFICATION
    // ------------------------------------------------------------------------

    this.emitProgress(
      request,
      DocumentProcessingStage.CLASSIFICATION,
      DocumentProcessingStatus.CLASSIFYING,
      0,
      "Classifying document.",
    );

    const classification = this.classifier.classify(request.source);

    if (classification.type === DocumentType.UNKNOWN) {
      throw new DocumentError(
        DocumentErrorCode.UNSUPPORTED_FORMAT,
        "The document format is not supported.",
        {
          ...this.errorDetails(
            request.source,
            DocumentProcessingStage.CLASSIFICATION,
          ),
        },
      );
    }

    this.emitProgress(
      request,
      DocumentProcessingStage.CLASSIFICATION,
      DocumentProcessingStatus.CLASSIFYING,
      1,
      `Document classified as "${classification.type}".`,
    );

    this.throwIfAborted(signal);

    // ------------------------------------------------------------------------
    // 3. PARSING
    // ------------------------------------------------------------------------

    this.emitProgress(
      request,
      DocumentProcessingStage.PARSING,
      DocumentProcessingStatus.PARSING,
      0,
      "Parsing document.",
    );

    const parser = this.parserRegistry.resolve(classification.type);

    if (!parser) {
      throw new DocumentError(
        DocumentErrorCode.UNSUPPORTED_FORMAT,
        `No parser is registered for document type "${classification.type}".`,
        {
          ...this.errorDetails(
            request.source,
            DocumentProcessingStage.PARSING,
            classification.type,
          ),
        },
      );
    }

    let parsed: ParsedDocument;

    try {
      parsed = await parser.parse(request.source, {
        signal,
      });
    } catch (error) {
      throw DocumentError.from(error, DocumentErrorCode.PARSE_FAILED, {
        ...this.errorDetails(
          request.source,
          DocumentProcessingStage.PARSING,
          classification.type,
        ),
      });
    }

    this.throwIfAborted(signal);

    this.emitProgress(
      request,
      DocumentProcessingStage.PARSING,
      DocumentProcessingStatus.PARSING,
      1,
      "Document parsing completed.",
    );

    // ------------------------------------------------------------------------
    // 4. NORMALIZATION
    // ------------------------------------------------------------------------

    this.emitProgress(
      request,
      DocumentProcessingStage.NORMALIZATION,
      DocumentProcessingStatus.NORMALIZING,
      0,
      "Normalizing document.",
    );

    let normalized: NormalizedDocument;

    try {
      normalized = this.normalizer.normalize(parsed, {
        signal,
      });
    } catch (error) {
      throw DocumentError.from(error, DocumentErrorCode.NORMALIZATION_FAILED, {
        ...this.errorDetails(
          request.source,
          DocumentProcessingStage.NORMALIZATION,
          classification.type,
        ),
      });
    }

    this.throwIfAborted(signal);

    this.emitProgress(
      request,
      DocumentProcessingStage.NORMALIZATION,
      DocumentProcessingStatus.NORMALIZING,
      1,
      "Document normalization completed.",
    );

    // ------------------------------------------------------------------------
    // 5. CHUNKING
    // ------------------------------------------------------------------------

    let chunks: readonly DocumentChunk[] = [];

    if (request.options?.generateChunks !== false) {
      this.emitProgress(
        request,
        DocumentProcessingStage.CHUNKING,
        DocumentProcessingStatus.CHUNKING,
        0,
        "Creating document chunks.",
      );

      try {
        const chunkOptions: DocumentChunkerOptions = {
          maxCharacters: request.options?.chunkSize,

          overlapCharacters: request.options?.chunkOverlap,

          signal,
        };

        chunks = this.chunker.chunk(normalized, chunkOptions);
      } catch (error) {
        throw DocumentError.from(error, DocumentErrorCode.CHUNKING_FAILED, {
          ...this.errorDetails(
            request.source,
            DocumentProcessingStage.CHUNKING,
            classification.type,
          ),
        });
      }

      this.emitProgress(
        request,
        DocumentProcessingStage.CHUNKING,
        DocumentProcessingStatus.CHUNKING,
        1,
        `Created ${chunks.length} document chunks.`,
      );
    }

    this.throwIfAborted(signal);

    // ------------------------------------------------------------------------
    // 6. INDEX PREPARATION
    // ------------------------------------------------------------------------

    this.emitProgress(
      request,
      DocumentProcessingStage.INDEXING,
      DocumentProcessingStatus.INDEXING,
      0,
      "Preparing document index.",
    );

    let indexBatch: IndexBatch;

    try {
      const indexingOptions: DocumentIndexingOptions = {
        signal,
      };

      indexBatch = this.indexer.createIndexBatch(
        normalized,
        chunks,
        indexingOptions,
      );
    } catch (error) {
      throw DocumentError.from(error, DocumentErrorCode.INDEXING_FAILED, {
        ...this.errorDetails(
          request.source,
          DocumentProcessingStage.INDEXING,
          classification.type,
        ),
      });
    }

    this.throwIfAborted(signal);

    this.emitProgress(
      request,
      DocumentProcessingStage.INDEXING,
      DocumentProcessingStatus.INDEXING,
      1,
      "Document index preparation completed.",
    );

    // ------------------------------------------------------------------------
    // 7. FINAL DOCUMENT
    // ------------------------------------------------------------------------

    const warnings: string[] = [
      ...validation.warnings,
      ...classification.warnings,
      ...(parsed.warnings ?? []),
    ];

    const processedAt = new Date().toISOString();

    const document: ProcessedDocument = {
      identity: normalized.identity,

      type: normalized.type,

      text: normalized.text,

      metadata: normalized.metadata,

      paragraphs: normalized.paragraphs,

      headings: normalized.headings,

      sections: normalized.sections,

      tables: normalized.tables,

      chunks,

      status: DocumentProcessingStatus.COMPLETED,

      processedAt,

      warnings,
    };

    this.throwIfAborted(signal);

    // ------------------------------------------------------------------------
    // 8. PERSIST DOCUMENT
    // ------------------------------------------------------------------------

    if (this.documentStore) {
      this.emitProgress(
        request,
        DocumentProcessingStage.STORAGE,
        DocumentProcessingStatus.COMPLETED,
        0,
        "Persisting processed document.",
      );

      try {
        await this.documentStore.save(document);
      } catch (error) {
        throw DocumentError.from(error, DocumentErrorCode.STORAGE_FAILED, {
          ...this.errorDetails(
            request.source,
            DocumentProcessingStage.STORAGE,
            classification.type,
          ),
        });
      }

      this.throwIfAborted(signal);

      this.emitProgress(
        request,
        DocumentProcessingStage.STORAGE,
        DocumentProcessingStatus.COMPLETED,
        1,
        "Processed document persisted.",
      );
    }

    // ------------------------------------------------------------------------
    // 9. WRITE INDEX
    // ------------------------------------------------------------------------

    if (this.indexSink) {
      try {
        await this.indexSink.write(indexBatch, {
          signal,
        });
      } catch (error) {
        throw DocumentError.from(error, DocumentErrorCode.INDEXING_FAILED, {
          ...this.errorDetails(
            request.source,
            DocumentProcessingStage.INDEXING,
            classification.type,
          ),
        });
      }
    }

    this.throwIfAborted(signal);

    // ------------------------------------------------------------------------
    // 10. PUBLISH RAW DOCUMENT TO GENERIC CONTEXT
    // ------------------------------------------------------------------------

    /**
     * Document -> Context connection for the raw/indexed representation.
     *
     * ContextDocumentIndexer receives:
     *
     *   ProcessedDocument
     *          +
     *      IndexBatch
     *
     * and translates them into generic context chunks.
     *
     * DocumentService itself never knows about:
     *
     *   - ContextManager
     *   - embedding providers
     *   - vector databases
     *   - retrieval implementations
     */
    if (this.contextSink) {
      this.emitProgress(
        request,
        DocumentProcessingStage.INDEXING,
        DocumentProcessingStatus.INDEXING,
        0,
        "Publishing document to context.",
      );

      try {
        await this.contextSink.index(document, indexBatch, {
          signal,
        });
      } catch (error) {
        throw DocumentError.from(error, DocumentErrorCode.INDEXING_FAILED, {
          ...this.errorDetails(
            request.source,
            DocumentProcessingStage.INDEXING,
            classification.type,
          ),
        });
      }

      this.throwIfAborted(signal);

      this.emitProgress(
        request,
        DocumentProcessingStage.INDEXING,
        DocumentProcessingStatus.INDEXING,
        1,
        "Document published to context.",
      );
    }

    // ------------------------------------------------------------------------
    // 11. SEMANTIC AI ANALYSIS
    // ------------------------------------------------------------------------

    /**
     * FINAL DOCUMENT -> AI CONNECTION
     *
     * The deterministic document pipeline is complete.
     *
     * We analyze the canonical ProcessedDocument rather than raw source data.
     *
     * Dependency direction:
     *
     *   DocumentService
     *        ↓
     *   DocumentAIAnalyzer
     *        ↓
     *   AIManagerDocumentAnalyzer
     *        ↓
     *   AIManager
     *        ↓
     *   AI provider
     *
     * DocumentService therefore remains independent of:
     *
     *   - Ollama
     *   - llama.cpp
     *   - Gemini
     *   - Mistral
     *   - cloud SDKs
     *   - model managers
     *   - provider-specific APIs
     *
     * The analyzer returns a DocumentAnalysis artifact.
     *
     * DocumentAnalysis is intentionally NOT merged into ProcessedDocument.
     *
     *   ProcessedDocument
     *       =
     *   canonical ingestion artifact
     *
     *   DocumentAnalysis
     *       =
     *   derived semantic artifact
     */
    let analysis: DocumentAnalysis | undefined;

    let analysisWarning: string | undefined;

    if (this.aiAnalysis) {
      this.throwIfAborted(signal);

      try {
        /**
         * Pass the same cancellation signal used by the document pipeline.
         *
         * This gives cancellation propagation:
         *
         *   DocumentService
         *        ↓
         *   AbortSignal
         *        ↓
         *   DocumentAIAnalyzer
         *        ↓
         *   AIManager
         *        ↓
         *   AI provider
         */
        analysis = await this.aiAnalysis.analyzer.analyze(document, {
          ...this.aiAnalysis.options,

          signal,
        });
      } catch (error) {
        /**
         * Cancellation is never converted into a warning.
         *
         * An explicit cancellation must terminate the operation.
         */
        if (signal?.aborted) {
          this.throwIfAborted(signal);
        }

        /**
         * If an analyzer already returned a DocumentError, preserve it.
         *
         * Otherwise translate the underlying AI/provider failure into
         * the document-domain AI analysis error.
         */
        const aiError = DocumentError.is(error)
          ? error
          : DocumentError.from(error, DocumentErrorCode.AI_ANALYSIS_FAILED, {
              ...this.errorDetails(
                request.source,
                DocumentProcessingStage.STORAGE,
                classification.type,
              ),
            });

        /**
         * Required AI analysis means semantic analysis is part of the
         * application's required workflow.
         */
        if (this.aiAnalysis.required === true) {
          throw aiError;
        }

        /**
         * Default/recommended behaviour:
         *
         *   document ingestion succeeds
         *   +
         *   AI enrichment remains best-effort
         *
         * This prevents a temporary:
         *
         *   - model failure
         *   - provider failure
         *   - network failure
         *   - timeout
         *   - cloud outage
         *
         * from destroying an otherwise valid document ingestion operation.
         */
        analysisWarning = aiError.message;

        warnings.push(
          `Document AI analysis was not completed: ${aiError.message}`,
        );
      }

      this.throwIfAborted(signal);
    }

    // ------------------------------------------------------------------------
    // 12. COMPLETION
    // ------------------------------------------------------------------------

    const completedAt = new Date();

    this.emitProgress(
      request,
      DocumentProcessingStage.STORAGE,
      DocumentProcessingStatus.COMPLETED,
      1,
      `Document processing completed in ${
        completedAt.getTime() - startedAt.getTime()
      }ms.`,
    );

    /**
     * IMPORTANT:
     *
     * ProcessedDocument remains the canonical ingestion artifact.
     *
     * DocumentAnalysis remains a separate derived artifact.
     *
     * Downstream consumers can independently consume the analysis:
     *
     *   DocumentAnalysis
     *        ├──→ Context analysis sink
     *        ├──→ Candidate evidence adapter
     *        ├──→ persistence
     *        └──→ UI/API
     */
    return {
      document,

      indexBatch,

      validation,

      classification: {
        type: classification.type,

        confidence: classification.confidence,

        source: classification.source,

        warnings: classification.warnings,
      },

      analysis,

      analysisWarning,
    };
  }

  // ==========================================================================
  // REQUEST VALIDATION
  // ==========================================================================

  private validateRequest(request: DocumentProcessingRequest): void {
    if (!request) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "Document processing request is required.",
      );
    }

    if (!request.source) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "Document source is required.",
      );
    }

    const source = request.source;

    if (
      source.data === undefined &&
      source.path === undefined &&
      source.url === undefined
    ) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "Document source must provide data, path, or URL.",
      );
    }
  }

  // ==========================================================================
  // PROGRESS
  // ==========================================================================

  private emitProgress(
    request: DocumentProcessingRequest,
    stage: DocumentProcessingStage,
    status: DocumentProcessingStatus,
    progress: number,
    message: string,
  ): void {
    const callback = request.options?.onProgress;

    if (!callback) {
      return;
    }

    const progressEvent: DocumentProcessingProgress = {
      documentId: request.documentId,

      stage,

      status,

      progress,

      message,

      timestamp: new Date().toISOString(),
    };

    callback(progressEvent);
  }

  // ==========================================================================
  // CANCELLATION
  // ==========================================================================

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw DocumentError.aborted(
      {
        stage: "document-processing",
      },
      signal.reason,
    );
  }

  // ==========================================================================
  // ERROR DETAILS
  // ==========================================================================

  private errorDetails(
    source: DocumentSource,
    stage: DocumentProcessingStage,
    documentType?: string,
  ): {
    readonly filename?: string;

    readonly path?: string;

    readonly mimeType?: string;

    readonly documentType?: string;

    readonly stage: DocumentProcessingStage;
  } {
    return {
      filename: source.filename,

      path: source.path,

      mimeType: source.mimeType,

      documentType,

      stage,
    };
  }
}
