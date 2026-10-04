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
// DOCUMENT -> CANDIDATE:
//
//   DocumentAnalysis
//        ↓
//   CandidateDocumentEvidencePort
//        ↓
//   CandidateDocumentEvidenceAdapter
//        ↓
//   CandidateEvidenceStore
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
//   - depend directly on CandidateService
//   - depend directly on CandidateProfileStore
//   - depend directly on CandidateEvidenceStore
//
// AI is connected through the DocumentAIAnalyzer port.
//
// Context publishing is performed through the injected
// DocumentContextSink boundary.
//
// Candidate publishing is performed through the injected
// CandidateDocumentEvidencePort boundary.
//
// Dependency direction:
//
//   Documents
//       ↓
//   DocumentAIAnalyzer
//       ↓
//   AI execution
//
// and:
//
//   Documents
//       ↓
//   CandidateDocumentEvidencePort
//       ↓
//   Candidate subsystem
//
// rather than:
//
//   Documents
//       ↓
//   CandidateService
//       ↓
//   Candidate stores
//
// ============================================================================

import { DocumentError, DocumentErrorCode } from "./DocumentError";

import type { CandidateDocumentEvidencePort } from "../candidate/contracts/CandidateDocumentEvidence";

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
   */
  readonly aiAnalysis?: DocumentAIAnalysisDependencies;

  /**
   * Optional connection from DocumentAnalysis into Candidate.
   *
   * IMPORTANT:
   *
   * DocumentService does NOT depend on CandidateService,
   * CandidateProfileStore, CandidateContextBuilder, or
   * CandidateEvidenceStore.
   *
   * It only knows the Candidate-owned ingestion port.
   *
   * Candidate remains responsible for deciding how document
   * facts become candidate evidence.
   */
  readonly candidateEvidence?: {
    readonly port: CandidateDocumentEvidencePort;

    /**
     * When true:
     *
     *   Candidate ingestion failure fails the document workflow.
     *
     * When false/omitted:
     *
     *   Document ingestion succeeds and the Candidate connection
     *   failure is returned as a warning.
     *
     * Recommended default: false.
     */
    readonly required?: boolean;
  };
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
   */
  readonly analysis?: DocumentAnalysis;

  /**
   * Indicates that document AI analysis was attempted but failed
   * while remaining non-fatal to document ingestion.
   */
  readonly analysisWarning?: string;

  /**
   * Result of publishing DocumentAnalysis into Candidate.
   *
   * Undefined means:
   *
   * - Candidate integration was not configured
   * - no candidateId was supplied
   * - AI analysis was unavailable
   * - Candidate publishing was not reached
   */
  readonly candidateEvidence?: Awaited<
    ReturnType<CandidateDocumentEvidencePort["ingest"]>
  >;

  /**
   * Indicates that Candidate evidence publishing was attempted but
   * remained non-fatal and failed.
   */
  readonly candidateEvidenceWarning?: string;
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

  /**
   * Optional Candidate evidence connection.
   *
   * DocumentService only knows the Candidate-owned port.
   *
   * It does not know Candidate storage or Candidate orchestration.
   */
  private readonly candidateEvidence?: {
    readonly port: CandidateDocumentEvidencePort;

    readonly required?: boolean;
  };

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

    this.candidateEvidence = dependencies.candidateEvidence;

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

    if (this.candidateEvidence && !this.candidateEvidence.port) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "Candidate evidence port is required when Candidate evidence integration is configured.",
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
   *
   * When Candidate integration is configured and a candidateId is supplied,
   * the resulting DocumentAnalysis is then published to Candidate through
   * CandidateDocumentEvidencePort.
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
      throw DocumentError.from(
        error,
        DocumentErrorCode.PARSE_FAILED,
        this.errorDetails(
          request.source,
          DocumentProcessingStage.PARSING,
          classification.type,
        ),
      );
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
      throw DocumentError.from(
        error,
        DocumentErrorCode.NORMALIZATION_FAILED,
        this.errorDetails(
          request.source,
          DocumentProcessingStage.NORMALIZATION,
          classification.type,
        ),
      );
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
        throw DocumentError.from(
          error,
          DocumentErrorCode.CHUNKING_FAILED,
          this.errorDetails(
            request.source,
            DocumentProcessingStage.CHUNKING,
            classification.type,
          ),
        );
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
      throw DocumentError.from(
        error,
        DocumentErrorCode.INDEXING_FAILED,
        this.errorDetails(
          request.source,
          DocumentProcessingStage.INDEXING,
          classification.type,
        ),
      );
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
        throw DocumentError.from(
          error,
          DocumentErrorCode.STORAGE_FAILED,
          this.errorDetails(
            request.source,
            DocumentProcessingStage.STORAGE,
            classification.type,
          ),
        );
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
        throw DocumentError.from(
          error,
          DocumentErrorCode.INDEXING_FAILED,
          this.errorDetails(
            request.source,
            DocumentProcessingStage.INDEXING,
            classification.type,
          ),
        );
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
        throw DocumentError.from(
          error,
          DocumentErrorCode.INDEXING_FAILED,
          this.errorDetails(
            request.source,
            DocumentProcessingStage.INDEXING,
            classification.type,
          ),
        );
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
    // 12. PUBLISH DOCUMENT ANALYSIS TO CANDIDATE
    // ------------------------------------------------------------------------

    /**
     * DOCUMENT -> CANDIDATE CONNECTION
     *
     * At this point:
     *
     *   ProcessedDocument
     *        +
     *   DocumentAnalysis
     *
     * are available when AI analysis succeeded.
     *
     * Candidate receives ONLY the canonical semantic analysis artifact.
     *
     * Candidate then decides how the extracted facts become:
     *
     *   CandidateEvidence
     *
     * DocumentService does NOT:
     *
     * - write candidate stores
     * - update candidate profiles
     * - update candidate skills
     * - update candidate experiences
     * - build candidate context
     * - perform candidate retrieval
     *
     * Dependency direction:
     *
     *   DocumentService
     *        ↓
     *   CandidateDocumentEvidencePort
     *        ↓
     *   CandidateDocumentEvidenceAdapter
     *        ↓
     *   CandidateEvidenceStore
     *
     * IMPORTANT:
     *
     * This connection happens AFTER semantic analysis.
     *
     * Therefore:
     *
     *   raw document
     *        X
     *
     *   ProcessedDocument
     *        X
     *
     *   Document chunks
     *        X
     *
     * are NOT passed directly into Candidate.
     *
     * Candidate receives:
     *
     *   DocumentAnalysis
     *
     * This preserves the ownership boundary between Documents and Candidate.
     */

    let candidateEvidence:
      Awaited<ReturnType<CandidateDocumentEvidencePort["ingest"]>> | undefined;

    let candidateEvidenceWarning: string | undefined;

    if (this.candidateEvidence && request.candidateId) {
      this.throwIfAborted(signal);

      /**
       * Candidate ingestion requires a successful semantic analysis.
       *
       * If AI analysis was optional and failed, there is no canonical
       * DocumentAnalysis artifact to publish.
       *
       * In that situation Candidate publishing is simply skipped.
       */
      if (analysis) {
        try {
          candidateEvidence = await this.candidateEvidence.port.ingest({
            candidateId: request.candidateId,

            analysis,

            signal,
          });

          this.throwIfAborted(signal);
        } catch (error) {
          /*
           * Cancellation must never be downgraded to a warning.
           */
          if (signal?.aborted) {
            this.throwIfAborted(signal);
          }

          /*
           * Candidate integration is downstream from document analysis.
           *
           * Therefore this is an integration/storage failure, NOT an
           * AI-analysis failure.
           *
           * Preserve an existing DocumentError when possible.
           * Otherwise translate the Candidate failure into the document
           * domain's storage/integration failure.
           */
          const candidateError = DocumentError.is(error)
            ? error
            : DocumentError.from(error, DocumentErrorCode.STORAGE_FAILED, {
                ...this.errorDetails(
                  request.source,
                  DocumentProcessingStage.STORAGE,
                  classification.type,
                ),

                metadata: {
                  candidateId: request.candidateId,

                  documentId: analysis.documentId,

                  analysisId: analysis.analysisId,

                  integration: "candidate",
                },
              });

          /*
           * Required Candidate integration:
           *
           * The document workflow cannot be considered complete if
           * Candidate evidence publication is mandatory.
           */
          if (this.candidateEvidence.required === true) {
            throw candidateError;
          }

          /*
           * Recommended default:
           *
           * Document ingestion remains successful even if Candidate
           * enrichment temporarily fails.
           *
           * This protects document ingestion from:
           *
           * - Candidate storage failures
           * - temporary persistence failures
           * - Candidate validation failures
           * - application startup ordering issues
           */
          candidateEvidenceWarning = candidateError.message;

          warnings.push(
            `Candidate evidence was not published: ${candidateError.message}`,
          );
        }

        this.throwIfAborted(signal);
      } else {
        /*
         * AI analysis was configured but no DocumentAnalysis artifact
         * exists.
         *
         * We intentionally do NOT send the raw ProcessedDocument to
         * Candidate as a fallback.
         *
         * Candidate ingestion is therefore skipped.
         *
         * If AI analysis itself already produced an analysisWarning,
         * that warning explains why Candidate could not be enriched.
         */
        if (analysisWarning) {
          candidateEvidenceWarning = `Candidate evidence was not published because document analysis was unavailable: ${analysisWarning}`;

          warnings.push(candidateEvidenceWarning);
        }
      }
    } else if (this.candidateEvidence && !request.candidateId) {
      /*
       * Candidate integration is configured, but this document was not
       * associated with a candidate.
       *
       * This is not an error because DocumentService also processes
       * generic non-candidate documents.
       */
      candidateEvidenceWarning =
        "Candidate evidence integration is configured, but no candidateId was supplied for this document.";
    }

    this.throwIfAborted(signal);

    // ------------------------------------------------------------------------
    // 13. COMPLETION
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
     * Candidate evidence remains owned by Candidate.
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

      candidateEvidence,

      candidateEvidenceWarning,
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
