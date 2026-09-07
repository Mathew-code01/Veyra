// core/documents/DOCXParser.ts

export interface DOCXTextProvider {
  extractText(buffer: Uint8Array): Promise<string>;
}

export class DOCXParser {
  public constructor(private readonly provider: DOCXTextProvider) {}

  public async parse(buffer: Uint8Array): Promise<string> {
    if (buffer.byteLength === 0) {
      throw new Error("Cannot parse an empty DOCX.");
    }

    const text = await this.provider.extractText(buffer);

    const normalized = text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!normalized) {
      throw new Error("No extractable text was found in the DOCX.");
    }

    return normalized;
  }
}