// core/documents/TextExtractor.ts

export interface TextExtractor {
  extract(input: Uint8Array): Promise<string>;
}

export class PlainTextExtractor implements TextExtractor {
  public async extract(input: Uint8Array): Promise<string> {
    const decoder = new TextDecoder("utf-8", { fatal: false });

    const text = decoder.decode(input).trim();

    if (!text) {
      throw new Error("The supplied text document is empty.");
    }

    return text;
  }
}