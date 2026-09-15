// ============================================================================
// FILE: core/cloud/capabilities/DocumentAnalysisCapability.ts
// ============================================================================

export type CloudDocumentType =
  | "pdf"
  | "docx"
  | "txt"
  | "markdown"
  | "html"
  | "image"
  | "spreadsheet"
  | "presentation";

export interface DocumentAnalysisCapability {
  readonly supported: boolean;

  readonly supportedDocumentTypes: readonly CloudDocumentType[];

  readonly supportsImages: boolean;

  readonly supportsTables: boolean;

  readonly supportsStructuredExtraction: boolean;

  readonly maxFileBytes?: number;
}
