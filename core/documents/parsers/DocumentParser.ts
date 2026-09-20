// ============================================================================
// FILE: core/documents/parsers/DocumentParser.ts
// PURPOSE:
// Canonical parser contract for the Veyra document-processing subsystem.
//
// ARCHITECTURE:
// DocumentSource
//      ↓
// DocumentParser
//      ↓
// ParsedDocument
//
// Parsers are responsible for understanding a file format.
// Parsers must NOT:
// - persist documents
// - access the database
// - call AI providers
// - generate embeddings
// - perform retrieval
// - perform indexing
// ============================================================================

import type {
  DocumentSource,
  DocumentType,
  ParsedDocument,
} from "../DocumentTypes";

export interface DocumentParser {
  /**
   * Format handled by this parser.
   */
  readonly type: DocumentType;

  /**
   * Parse a document source into the canonical document representation.
   */
  parse(source: DocumentSource): Promise<ParsedDocument>;
}
