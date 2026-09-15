// ============================================================================
// FILE: core/cloud/capabilities/CloudCapability.ts
// ============================================================================

export type CloudCapability =
  | "text_generation"
  | "streaming"
  | "vision"
  | "speech_to_text"
  | "text_to_speech"
  | "embedding"
  | "document_analysis"
  | "structured_output"
  | "tool_calling";
