// core/ai/AIStream.ts

import type { AIStreamChunk } from "./AIResponse";

export class AIStream {
  private readonly chunks: AIStreamChunk[] = [];

  private closed = false;

  public push(chunk: AIStreamChunk): void {
    if (this.closed) {
      return;
    }

    this.chunks.push(chunk);

    if (chunk.done) {
      this.closed = true;
    }
  }

  public getChunks(): readonly AIStreamChunk[] {
    return Object.freeze([...this.chunks]);
  }

  public getText(): string {
    return this.chunks.map((chunk) => chunk.text).join("");
  }

  public isClosed(): boolean {
    return this.closed;
  }

  public close(): void {
    this.closed = true;
  }

  public reset(): void {
    this.chunks.length = 0;

    this.closed = false;
  }
}
