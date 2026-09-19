// ============================================================================
// FILE: core/documents/classification/MimeTypeResolver.ts
// PURPOSE:
// Resolves MIME types and file extensions into canonical document types.
// ============================================================================

import { DocumentType } from "../DocumentTypes";

import { DOCUMENT_FORMATS } from "./DocumentType";

export class MimeTypeResolver {
  private readonly formats = DOCUMENT_FORMATS;

  public resolveFromMimeType(mimeType: string | undefined): DocumentType {
    if (!mimeType) {
      return DocumentType.UNKNOWN;
    }

    const normalized = mimeType.trim().toLowerCase().split(";")[0].trim();

    const format = this.formats.find((item) =>
      item.mimeTypes.some(
        (supported) => supported.toLowerCase() === normalized,
      ),
    );

    return format?.type ?? DocumentType.UNKNOWN;
  }

  public resolveFromExtension(
    filenameOrExtension: string | undefined,
  ): DocumentType {
    if (!filenameOrExtension) {
      return DocumentType.UNKNOWN;
    }

    const normalized = filenameOrExtension.trim().toLowerCase();

    const extension = normalized.startsWith(".")
      ? normalized
      : this.extractExtension(normalized);

    if (!extension) {
      return DocumentType.UNKNOWN;
    }

    const format = this.formats.find((item) =>
      item.extensions.includes(extension),
    );

    return format?.type ?? DocumentType.UNKNOWN;
  }

  public resolve(mimeType?: string, filename?: string): DocumentType {
    const mimeResult = this.resolveFromMimeType(mimeType);

    if (mimeResult !== DocumentType.UNKNOWN) {
      return mimeResult;
    }

    return this.resolveFromExtension(filename);
  }

  private extractExtension(filename: string): string | undefined {
    const lastSlash = Math.max(
      filename.lastIndexOf("/"),
      filename.lastIndexOf("\\"),
    );

    const basename = filename.slice(lastSlash + 1);

    const lastDot = basename.lastIndexOf(".");

    if (lastDot <= 0 || lastDot === basename.length - 1) {
      return undefined;
    }

    return basename.slice(lastDot).toLowerCase();
  }
}
