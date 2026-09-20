// ============================================================================
// FILE: core/documents/parsers/ParserUtils.ts
// PURPOSE:
// Shared parser utilities.
//
// This file intentionally contains only deterministic helpers.
// It must not depend on database, AI, network, or application services.
// ============================================================================

import type { DocumentIdentity, DocumentParagraph } from "../DocumentTypes";

/**
 * Creates a deterministic-ish document identity when the caller
 * has not supplied a document ID.
 *
 * This is NOT intended to replace cryptographic checksums.
 * The final checksum should be calculated by the storage/integrity layer.
 */
export function createDocumentIdentity(
  source: {
    readonly filename?: string;
    readonly externalId?: string;
  },
  documentId?: string,
): DocumentIdentity {
  const id =
    documentId?.trim() ||
    source.externalId?.trim() ||
    createLocalDocumentId(source.filename);

  return {
    id,
    filename: source.filename,
  };
}

/**
 * Creates a local identifier.
 *
 * Uses crypto.randomUUID when available.
 * Falls back to a timestamp/random combination for environments
 * where Web Crypto is unavailable.
 */
export function createLocalDocumentId(filename?: string): string {
  const cryptoObject = globalThis.crypto;

  if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }

  const safeFilename =
    filename?.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40) || "document";

  return `${safeFilename}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/**
 * Splits plain text into meaningful paragraphs.
 *
 * Blank lines are treated as paragraph boundaries.
 */
export function splitIntoParagraphs(
  text: string,
  documentId: string,
): DocumentParagraph[] {
  const blocks = text
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((paragraph, index) => ({
    id: `${documentId}:paragraph:${index}`,
    text: paragraph,
    order: index,
  }));
}

/**
 * Normalizes common newline variants without aggressively
 * changing semantic whitespace.
 */
export function normalizeNewlines(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "");
}

/**
 * Removes a UTF-8 BOM when present.
 */
export function removeBom(text: string): string {
  return text.startsWith("\uFEFF") ? text.slice(1) : text;
}

/**
 * Safely decode UTF-8 data.
 */
export function decodeUtf8(data: Uint8Array): string {
  const decoder = new TextDecoder("utf-8", {
    fatal: false,
  });

  return removeBom(decoder.decode(data));
}

/**
 * Basic parser-level whitespace cleanup.
 *
 * This intentionally does not perform full document normalization.
 * Batch 3 owns normalization.
 */
export function cleanParserText(text: string): string {
  return normalizeNewlines(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n")
    .trim();
}

/**
 * Checks whether a source contains data.
 */
export function assertSourceData(
  data: Uint8Array | undefined,
  formatName: string,
): Uint8Array {
  if (!data || data.byteLength === 0) {
    throw new Error(`Cannot parse an empty ${formatName} document.`);
  }

  return data;
}
