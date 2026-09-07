// core/context/DocumentParser.ts

export type DocumentType =
  | "resume"
  | "cover-letter"
  | "job-description"
  | "project"
  | "experience"
  | "skills"
  | "story"
  | "company-research"
  | "generic";

export interface DocumentMetadata {
  readonly type?: DocumentType;
  readonly candidateId?: string;
  readonly source?: string;
  readonly mimeType?: string;
  readonly fileName?: string;
  readonly documentName?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly tags?: readonly string[];
  readonly [key: string]: unknown;
}

export interface DocumentInput {
  readonly id: string;
  readonly name: string;
  readonly type: DocumentType;
  readonly text?: string;
  readonly buffer?: Uint8Array;
  readonly metadata?: DocumentMetadata;
}

export interface ParsedDocument {
  readonly id: string;
  readonly name: string;
  readonly type: DocumentType;
  readonly text: string;
  readonly metadata: DocumentMetadata;
}

export interface DocumentParser {
  parse(input: DocumentInput): ParsedDocument;
}

export class DefaultDocumentParser implements DocumentParser {
  public parse(input: DocumentInput): ParsedDocument {
    if (!input.id.trim()) {
      throw new Error("Document id is required.");
    }

    if (!input.name.trim()) {
      throw new Error("Document name is required.");
    }

    if (!input.type) {
      throw new Error("Document type is required.");
    }

    const text = input.text?.trim() ?? "";

    if (!text) {
      throw new Error(
        `Document "${input.name}" does not contain extracted text.`,
      );
    }

    return {
      id: input.id,
      name: input.name,
      type: input.type,
      text,
      metadata: {
        ...input.metadata,
        type: input.type,
        documentName: input.name,
      },
    };
  }
}