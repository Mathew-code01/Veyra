// ============================================================================
// FILE: core/documents/extraction/TableExtractor.ts
// PURPOSE:
// Extracts table structures from parsed documents.
// ============================================================================

import type { DocumentTable, ParsedDocument } from "../DocumentTypes";

export interface ExtractedTables {
  readonly tables: readonly DocumentTable[];

  readonly tableCount: number;

  readonly warnings: readonly string[];
}

export class TableExtractor {
  public extract(document: ParsedDocument): ExtractedTables {
    const tables = document.tables
      ? document.tables.map((table) => ({
          ...table,
          headers: table.headers ? [...table.headers] : undefined,
          cells: [...table.cells],
        }))
      : [];

    return {
      tables,
      tableCount: tables.length,
      warnings: [],
    };
  }
}
