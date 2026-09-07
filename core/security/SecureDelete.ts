// core/security/SecureDelete.ts

export interface SecureDeleteTarget {
  readonly path: string;
}

export interface SecureDeleteAdapter {
  exists(path: string): Promise<boolean>;

  remove(path: string): Promise<void>;

  overwrite?(path: string, data: Uint8Array): Promise<void>;
}

export interface SecureDeleteOptions {
  readonly overwritePasses?: number;
}

export class SecureDelete {
  private readonly overwritePasses: number;

  public constructor(options: SecureDeleteOptions = {}) {
    this.overwritePasses = Math.max(
      1,
      Math.min(options.overwritePasses ?? 1, 3),
    );
  }

  public async remove(
    target: SecureDeleteTarget,
    adapter: SecureDeleteAdapter,
  ): Promise<void> {
    if (!target.path.trim()) {
      throw new Error("Secure-delete path cannot be empty.");
    }

    const exists = await adapter.exists(target.path);

    if (!exists) {
      return;
    }

    if (adapter.overwrite) {
      for (let pass = 0; pass < this.overwritePasses; pass++) {
        const size = await this.estimateSize(target.path, adapter);

        if (size > 0) {
          await adapter.overwrite(target.path, randomBytes(size));
        }
      }
    }

    await adapter.remove(target.path);
  }

  public wipeBytes(bytes: Uint8Array): void {
    if (bytes.length === 0) {
      return;
    }

    globalThis.crypto.getRandomValues(bytes);

    bytes.fill(0);
  }

  private async estimateSize(
    _path: string,
    _adapter: SecureDeleteAdapter,
  ): Promise<number> {
    /*
     * The core layer intentionally does not know
     * how the host filesystem works.
     *
     * The Electron FileService can provide a more
     * appropriate implementation later.
     */
    return 0;
  }
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);

  globalThis.crypto.getRandomValues(bytes);

  return bytes;
}