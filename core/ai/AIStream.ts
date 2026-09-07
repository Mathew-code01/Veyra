// core/ai/AIStream.ts

import type { AIStreamChunk } from "./AIResponse";

export class AIStream {
  private readonly chunks: AIStreamChunk[] = [];

  private closed = false;

  push(chunk: AIStreamChunk): void {
    if (this.closed) {
      return;
    }

    this.chunks.push(chunk);

    if (chunk.done) {
      this.closed = true;
    }
  }

  getChunks(): AIStreamChunk[] {
    return [...this.chunks];
  }

  getText(): string {
    return this.chunks.map((chunk) => chunk.text).join("");
  }

  isClosed(): boolean {
    return this.closed;
  }

  close(): void {
    this.closed = true;
  }

  reset(): void {
    this.chunks.length = 0;
    this.closed = false;
  }
}