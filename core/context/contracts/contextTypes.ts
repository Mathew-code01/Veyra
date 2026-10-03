// ============================================================================
// FILE: core/context/contracts/ContextTypes.ts
//
// PURPOSE:
// Canonical domain types for the generic Veyra Context subsystem.
//
// CONTEXT ANSWERS:
//
//     "What information should Veyra know?"
//
// It does NOT answer:
//
//     "Where did this information implementation come from?"
//     "How should an interview answer be generated?"
//     "How should Vision perform analysis?"
//     "How should a document be parsed?"
//
// Context is deliberately source-agnostic.
//
// Possible sources include:
// - documents
// - vision
// - audio
// - conversation
// - candidate
// - memory
// - web
// - tools
// - generated content
// - application state
// - future sources
//
// ARCHITECTURAL RULE:
//
//     core/context
//          -X-> core/documents
//          -X-> core/vision
//          -X-> core/audio
//          -X-> core/conversation
//          -X-> core/candidate
//          -X-> core/interview
//
// Source domains publish/translate information INTO Context.
// Context never reaches back into those implementations.
// ============================================================================

// ============================================================================
// SOURCE TYPES
// ============================================================================

/**
 * Broad origin of a piece of context.
 *
 * This describes WHERE information came from.
 */
export type ContextSourceType =
  | "document"
  | "vision"
  | "audio"
  | "conversation"
  | "candidate"
  | "memory"
  | "web"
  | "tool"
  | "generated"
  | "application"
  | "unknown";

// ============================================================================
// CONTENT TYPES
// ============================================================================

/**
 * Generic semantic category of context.
 *
 * This describes WHAT the information represents.
 *
 * This list is intentionally broader than documents.
 */
export type ContextContentType =
  | "resume"
  | "cover-letter"
  | "job-description"
  | "project"
  | "experience"
  | "skills"
  | "story"
  | "company-research"
  | "education"
  | "certification"
  | "conversation"
  | "transcript"
  | "question"
  | "answer"
  | "visual-observation"
  | "visual-text"
  | "visual-object"
  | "web-result"
  | "tool-result"
  | "memory"
  | "generated"
  | "application-state"
  | "generic";

// ============================================================================
// SCOPE
// ============================================================================

/**
 * Optional scope used to constrain context.
 *
 * Context itself does not own these domains.
 *
 * The identifiers simply allow callers to say:
 *
 *     "Only retrieve context belonging to this candidate."
 *     "Only retrieve context belonging to this conversation."
 *     "Only retrieve context belonging to this interview."
 *
 * Context does not interpret the meaning of these identifiers.
 */
export interface ContextScope {
  readonly candidateId?: string;

  readonly conversationId?: string;

  readonly interviewId?: string;

  readonly sessionId?: string;

  readonly applicationId?: string;

  readonly userId?: string;

  readonly [key: string]: unknown;
}

// ============================================================================
// SOURCE
// ============================================================================

/**
 * Provenance information describing where a context item came from.
 */
export interface ContextSource {
  readonly type: ContextSourceType;

  /**
   * Stable source identifier when available.
   *
   * Examples:
   * - document ID
   * - vision analysis ID
   * - audio transcript/session ID
   * - conversation message ID
   * - web result ID
   */
  readonly id?: string;

  /**
   * Human-readable source name.
   */
  readonly name?: string;

  /**
   * Optional source URI/path/reference.
   *
   * Context does not interpret it.
   */
  readonly uri?: string;

  /**
   * Source-specific metadata.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// CONTEXT METADATA
// ============================================================================

/**
 * Arbitrary metadata attached to context.
 *
 * The generic Context subsystem preserves this information but does not
 * interpret source-specific metadata.
 */
export type ContextMetadata = Readonly<Record<string, unknown>>;

// ============================================================================
// CONTEXT ITEM
// ============================================================================

/**
 * Canonical generic unit of contextual knowledge.
 *
 * This is the central object Context works with.
 */
export interface ContextItem {
  /**
   * Stable Context identity.
   */
  readonly id: string;

  /**
   * Human-readable name/title.
   */
  readonly name: string;

  /**
   * Semantic type of the information.
   */
  readonly contentType: ContextContentType;

  /**
   * Origin of the information.
   */
  readonly source: ContextSource;

  /**
   * Optional retrieval/application scope.
   */
  readonly scope?: ContextScope;

  /**
   * Full textual representation of the context item.
   */
  readonly text: string;

  /**
   * Additional source/application metadata.
   */
  readonly metadata: ContextMetadata;

  /**
   * Creation timestamp.
   */
  readonly createdAt: string;

  /**
   * Last update timestamp.
   */
  readonly updatedAt: string;
}

// ============================================================================
// CONTEXT CHUNK
// ============================================================================

/**
 * Canonical generic chunk used by the embedding/retrieval layer.
 */
export interface ContextChunk {
  readonly id: string;

  /**
   * Parent ContextItem identity.
   */
  readonly contextId: string;

  /**
   * Chunk text.
   */
  readonly text: string;

  /**
   * Position within the original ContextItem text.
   */
  readonly index: number;

  readonly startOffset: number;

  readonly endOffset: number;

  /**
   * Approximate token count.
   */
  readonly tokenEstimate: number;

  /**
   * Generic provenance.
   */
  readonly source: ContextSource;

  /**
   * Optional retrieval scope.
   */
  readonly scope?: ContextScope;

  /**
   * Semantic content type.
   */
  readonly contentType: ContextContentType;

  /**
   * Arbitrary metadata.
   */
  readonly metadata: ContextMetadata;
}

// ============================================================================
// CONTEXT INPUT
// ============================================================================

/**
 * Input used when Context itself is responsible for parsing/chunking.
 *
 * This is useful for:
 * - simple conversation context
 * - memory
 * - web result
 * - generated text
 * - application state
 * - generic source text
 *
 * Document processing should normally use the prepared-context path.
 */
export interface ContextInput {
  readonly id: string;

  readonly name: string;

  readonly contentType: ContextContentType;

  readonly source: ContextSource;

  readonly scope?: ContextScope;

  readonly text: string;

  readonly metadata?: ContextMetadata;

  readonly createdAt?: string;

  readonly updatedAt?: string;
}

// ============================================================================
// PREPARED CONTEXT
// ============================================================================

/**
 * Context plus already-created chunks.
 *
 * Source subsystems can use this when they have already performed their
 * domain-specific parsing/normalization/chunking.
 */
export interface PreparedContext {
  readonly context: ContextItem;

  readonly chunks: readonly ContextChunk[];
}
