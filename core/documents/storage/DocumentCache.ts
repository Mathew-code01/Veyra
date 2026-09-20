// ============================================================================
// FILE: core/documents/storage/DocumentCache.ts
// PURPOSE:
// Optional in-process cache contract.
//
// This is intentionally not tied to Redis, SQLite, Map, etc.
// ============================================================================

export interface DocumentCache<T = unknown> {
  get(key: string): Promise<T | null>;

  set(key: string, value: T, ttlMilliseconds?: number): Promise<void>;

  delete(key: string): Promise<void>;

  has(key: string): Promise<boolean>;

  clear(): Promise<void>;
}

export class MemoryDocumentCache<T = unknown> implements DocumentCache<T> {
  private readonly entries = new Map<
    string,
    {
      value: T;
      expiresAt?: number;
    }
  >();

  public async get(key: string): Promise<T | null> {
    const entry = this.entries.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt !== undefined && Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }

    return entry.value;
  }

  public async set(
    key: string,
    value: T,
    ttlMilliseconds?: number,
  ): Promise<void> {
    const expiresAt =
      ttlMilliseconds !== undefined
        ? Date.now() + Math.max(1, ttlMilliseconds)
        : undefined;

    this.entries.set(key, {
      value,
      expiresAt,
    });
  }

  public async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  public async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  public async clear(): Promise<void> {
    this.entries.clear();
  }
}
