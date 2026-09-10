// core/models/installation/ModelOperationLock.ts

import { promises as fs } from "node:fs";

interface LockMetadata {
  readonly pid: number;

  readonly createdAt: number;

  readonly operation: string;
}

export interface ModelOperationLockOptions {
  readonly lockPath: string;

  readonly staleAfterMs?: number;
}

const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;

function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (
      error as {
        code?: unknown;
      }
    ).code;

    return typeof code === "string" ? code : undefined;
  }

  return undefined;
}

function isValidPid(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export class ModelOperationLock {
  private readonly lockPath: string;

  private readonly staleAfterMs: number;

  private held = false;

  public constructor(options: ModelOperationLockOptions) {
    if (!options.lockPath.trim()) {
      throw new Error("ModelOperationLock requires a lock path.");
    }

    this.lockPath = options.lockPath;

    this.staleAfterMs = Math.max(
      10_000,
      Math.floor(options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS),
    );
  }

  public async acquire(operation: string): Promise<void> {
    if (this.held) {
      throw new Error(
        "This model operation lock is already held by the current instance.",
      );
    }

    await this.reconcileExistingLock();

    const metadata: LockMetadata = Object.freeze({
      pid: process.pid,

      createdAt: Date.now(),

      operation: operation.trim() || "unknown",
    });

    try {
      const handle = await fs.open(this.lockPath, "wx");

      try {
        await handle.writeFile(
          `${JSON.stringify(metadata, null, 2)}\n`,
          "utf8",
        );

        await handle.sync();
      } finally {
        await handle.close();
      }

      this.held = true;
    } catch (error) {
      throw new Error(`Model operation lock is already held: "${operation}".`, {
        cause: error,
      });
    }
  }

  public async release(): Promise<void> {
    if (!this.held) {
      return;
    }

    this.held = false;

    await fs.rm(this.lockPath, {
      force: true,
    });
  }

  public async withLock<T>(
    operation: string,
    callback: () => Promise<T>,
  ): Promise<T> {
    await this.acquire(operation);

    try {
      return await callback();
    } finally {
      await this.release();
    }
  }

  private async reconcileExistingLock(): Promise<void> {
    let content: string;

    try {
      content = await fs.readFile(this.lockPath, "utf8");
    } catch (error) {
      if (getErrorCode(error) === "ENOENT") {
        return;
      }

      throw new Error("Unable to inspect the existing model operation lock.", {
        cause: error,
      });
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(content);
    } catch (error) {
      if (await this.removeIfStaleByFilesystemTime()) {
        return;
      }

      throw new Error(
        "A model operation lock exists but its metadata is unreadable.",
        {
          cause: error,
        },
      );
    }

    if (!parsed || typeof parsed !== "object") {
      if (await this.removeIfStaleByFilesystemTime()) {
        return;
      }

      throw new Error("A model operation lock exists with invalid metadata.");
    }

    const record = parsed as Record<string, unknown>;

    const pid = record.pid;

    const createdAt = record.createdAt;

    if (!isValidPid(pid) || !isValidTimestamp(createdAt)) {
      if (await this.removeIfStaleByFilesystemTime()) {
        return;
      }

      throw new Error("A model operation lock exists with invalid metadata.");
    }

    /*
     * pid is now narrowed to number.
     */
    try {
      process.kill(pid, 0);

      throw new Error(
        `Model operation is currently active under process ${pid}.`,
      );
    } catch (error) {
      if (error instanceof Error && /currently active/.test(error.message)) {
        throw error;
      }

      const code = getErrorCode(error);

      if (code === "EPERM") {
        throw new Error(
          `The model operation process ${pid} exists but could not be inspected because the operating system denied access.`,
          {
            cause: error,
          },
        );
      }

      if (code === "ESRCH") {
        await fs.rm(this.lockPath, {
          force: true,
        });

        return;
      }

      throw error;
    }
  }

  private async removeIfStaleByFilesystemTime(): Promise<boolean> {
    try {
      const fileStat = await fs.stat(this.lockPath);

      const age = Date.now() - fileStat.mtimeMs;

      if (age < this.staleAfterMs) {
        return false;
      }

      await fs.rm(this.lockPath, {
        force: true,
      });

      return true;
    } catch (error) {
      if (getErrorCode(error) === "ENOENT") {
        return true;
      }

      throw error;
    }
  }
}
