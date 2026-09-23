// ============================================================================
// FILE: core/documents/index.ts
// PURPOSE:
// Public API surface for the document subsystem.
//
// Consumers should prefer importing from this file instead of reaching
// deep into internal implementation files.
//
// ARCHITECTURE:
//
//   core/documents
//        │
//        ├── validation
//        ├── classification
//        ├── parsing
//        ├── normalization
//        ├── chunking
//        ├── index preparation
//        ├── storage
//        │
//        └── ContextDocumentIndexer
//                  │
//                  ▼
//             core/context
//
// IMPORTANT:
// The document subsystem owns document ingestion.
//
// The context subsystem owns generic contextual indexing, embeddings,
// vector storage, retrieval, ranking and compression.
//
// ContextDocumentIndexer is the explicit integration boundary between
// those two subsystems.
// ============================================================================

// ============================================================================
// CORE TYPES
// ============================================================================

export {
  DocumentType,
  DocumentSourceType,
  DocumentProcessingStatus,
  DocumentProcessingStage,
} from "./DocumentTypes";

export type {
  DocumentSource,
  DocumentIdentity,
  DocumentParagraph,
  DocumentHeading,
  DocumentSection,
  DocumentTableCell,
  DocumentTable,
  ParsedDocument,
  NormalizedDocument,
  DocumentChunkSource,
  DocumentChunk,
  ProcessedDocument,
  DocumentProcessingProgress,
  DocumentProcessingOptions,
  DocumentProcessingRequest,
} from "./DocumentTypes";

// ============================================================================
// METADATA
// ============================================================================

export {
  createDocumentMetadata,
  DOCUMENT_METADATA_VERSION,
} from "./DocumentMetadata";

export type { DocumentMetadata } from "./DocumentMetadata";

// ============================================================================
// ERRORS
// ============================================================================

export { DocumentError, DocumentErrorCode } from "./DocumentError";

export type {
  DocumentErrorDetails,
  SerializedDocumentError,
} from "./DocumentError";

// ============================================================================
// CLASSIFICATION
// ============================================================================

export { DocumentClassifier } from "./classification/DocumentClassifier";

export { DOCUMENT_FORMATS } from "./classification/DocumentType";

export type {
  DocumentTypeDetectionResult,
  DocumentFormatDefinition,
} from "./classification/DocumentType";

export { MimeTypeResolver } from "./classification/MimeTypeResolver";

// ============================================================================
// NORMALIZATION
// ============================================================================

export { DocumentNormalizer } from "./normalization/DocumentNormalizer";

export type { DocumentNormalizationOptions } from "./normalization/DocumentNormalizer";

export { TextNormalizer } from "./normalization/TextNormalizer";

export type { TextNormalizationOptions } from "./normalization/TextNormalizer";

export { WhitespaceNormalizer } from "./normalization/WhitespaceNormalizer";

// ============================================================================
// CHUNKING
// ============================================================================

export { DocumentChunker } from "./chunking/DocumentChunker";

export type { DocumentChunkerOptions } from "./chunking/DocumentChunker";

export { StructuralChunkStrategy } from "./chunking/ChunkStrategy";

export type {
  ChunkStrategy,
  ChunkStrategyOptions,
  ChunkCandidate,
} from "./chunking/ChunkStrategy";

export { estimateTokens } from "./chunking/ChunkMetadata";

export type { ChunkMetadata } from "./chunking/ChunkMetadata";

// ============================================================================
// INDEXING
// ============================================================================

export {
  DocumentIndexer,
  DOCUMENT_INDEX_SCHEMA_VERSION,
} from "./indexing/DocumentIndexer";

export type { DocumentIndexingOptions } from "./indexing/DocumentIndexer";

export type { IndexDocument, IndexBatch } from "./indexing/IndexDocument";

export type { IndexMetadata } from "./indexing/IndexMetadata";

// ============================================================================
// DOCUMENT → CONTEXT INTEGRATION
// ============================================================================
//
// This is the explicit integration boundary between:
//
//   core/documents
//          ↓
//   core/context
//
// ContextDocumentIndexer is the concrete adapter.
//
// DocumentContextSink is the document-side abstraction that allows
// DocumentService and other document orchestration code to publish
// processed documents into context without depending directly on
// ContextManager.
//
// IMPORTANT:
// Exporting these from the public document API makes the integration
// discoverable without requiring consumers to import internal files.
// ============================================================================

export { ContextDocumentIndexer } from "./ContextDocumentIndexer";

export type {
  DocumentContextIndexOptions,
  DocumentContextSink,
} from "./DocumentContextSink";

// ============================================================================
// STORAGE
// ============================================================================

export type {
  DocumentStore,
  DocumentMetadataStore,
} from "./storage/DocumentStore";

export { MemoryDocumentCache } from "./storage/DocumentCache";

export type { DocumentCache } from "./storage/DocumentCache";

export type {
  DocumentArtifact,
  DocumentArtifactType,
  DocumentArtifactStore,
} from "./storage/DocumentArtifactStore";

// ============================================================================
// VALIDATION
// ============================================================================

export { DocumentValidator } from "./validation/DocumentValidator";

export type { DocumentValidationResult } from "./validation/DocumentValidator";

export { FileValidator } from "./validation/FileValidator";

export type { FileValidationResult } from "./validation/FileValidator";

export { DocumentSecurityValidator } from "./validation/DocumentSecurityValidator";

export type { DocumentSecurityValidationResult } from "./validation/DocumentSecurityValidator";

// ============================================================================
// PIPELINE
// ============================================================================

export { DocumentPipeline } from "./pipeline/DocumentPipeline";

export type { DocumentPipelineOptions } from "./pipeline/DocumentPipeline";

export type {
  DocumentPipelineContext,
  DocumentPipelineStage,
} from "./pipeline/DocumentPipelineStage";

export type { DocumentPipelineResult } from "./pipeline/DocumentPipelineResult";

export type {
  DocumentProcessingJob,
  DocumentProcessingJobStatus,
  DocumentJobStore,
} from "./pipeline/DocumentProcessingJob";

// ============================================================================
// SERVICE
// ============================================================================

export {
  DocumentService,
  DefaultDocumentParserRegistry,
} from "./DocumentService";

export type {
  DocumentParserAdapter,
  DocumentParserRegistry,
  DocumentIndexSink,
  DocumentServiceDependencies,
  DocumentServiceResult,
} from "./DocumentService";
