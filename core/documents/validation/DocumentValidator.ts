// ============================================================================
// FILE: core/documents/validation/DocumentValidator.ts
// PURPOSE:
// Coordinates document-level validation.
// ============================================================================

import type {
  DocumentProcessingOptions,
  DocumentSource,
} from "../DocumentTypes";

import { FileValidator, type FileValidationResult } from "./FileValidator";

import {
  DocumentSecurityValidator,
  type DocumentSecurityValidationResult,
} from "./DocumentSecurityValidator";

export interface DocumentValidationResult {
  readonly valid: boolean;

  readonly file: FileValidationResult;

  readonly security: DocumentSecurityValidationResult;

  readonly warnings: readonly string[];
}

export class DocumentValidator {
  private readonly fileValidator: FileValidator;

  private readonly securityValidator: DocumentSecurityValidator;

  public constructor(
    fileValidator: FileValidator = new FileValidator(),
    securityValidator: DocumentSecurityValidator = new DocumentSecurityValidator(),
  ) {
    this.fileValidator = fileValidator;
    this.securityValidator = securityValidator;
  }

  public validate(
    source: DocumentSource,
    options: DocumentProcessingOptions = {},
  ): DocumentValidationResult {
    const file = this.fileValidator.validate(source, options);

    const security = this.securityValidator.validate(source);

    return {
      valid: file.valid && security.safe,
      file,
      security,
      warnings: [...file.warnings, ...security.warnings],
    };
  }
}
