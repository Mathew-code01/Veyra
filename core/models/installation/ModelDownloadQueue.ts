// core/models/installation/ModelDownloadQueue.ts

import { promises as fs } from "node:fs";

import path from "node:path";

import type { ModelDefinition } from "../ModelRegistry";

import { ModelDownloader } from "../ModelDownloader";

import type { ModelDownloadProgress } from "../ModelDownloader";

import {
  isTerminalDownloadState,
  type DownloadQueueItem,
  type DownloadState,
} from "./DownloadState";

export interface QueueItemProgressEvent {
  readonly item: DownloadQueueItem;
}

export interface ModelDownloadQueueOptions {
  readonly stateFilePath: string;

  readonly concurrency?: number;

  readonly modelResolver: (modelId: string) => ModelDefinition | undefined;

  readonly downloader?: ModelDownloader;

  readonly onProgress?: (event: QueueItemProgressEvent) => void;
}

interface PersistedQueue {
  readonly version: 1;

  readonly items: readonly DownloadQueueItem[];
}

const QUEUE_STATE_VERSION = 1 as const;

export class ModelDownloadQueue {
  private readonly items = new Map<string, DownloadQueueItem>();

  private readonly abortControllers = new Map<string, AbortController>();

  private readonly modelResolver: ModelDownloadQueueOptions["modelResolver"];

  private readonly stateFilePath: string;

  private readonly concurrency: number;

  private readonly downloader: ModelDownloader;

  private readonly onProgress?: ModelDownloadQueueOptions["onProgress"];

  private runningCount = 0;

  private pumpScheduled = false;

  public constructor(options: ModelDownloadQueueOptions) {
    this.modelResolver = options.modelResolver;

    this.stateFilePath = path.resolve(options.stateFilePath);

    this.concurrency = Math.max(1, Math.floor(options.concurrency ?? 1));

    this.downloader = options.downloader ?? new ModelDownloader();

    this.onProgress = options.onProgress;
  }

  public async initialize(): Promise<void> {
    await fs.mkdir(path.dirname(this.stateFilePath), {
      recursive: true,
    });

    try {
      const content = await fs.readFile(this.stateFilePath, "utf8");

      const parsed: unknown = JSON.parse(content);

      if (!parsed || typeof parsed !== "object") {
        return;
      }

      const persisted = parsed as PersistedQueue;

      if (persisted.version !== QUEUE_STATE_VERSION) {
        return;
      }

      for (const item of persisted.items) {
        if (
          item.state === "downloading" ||
          item.state === "preparing" ||
          item.state === "verifying"
        ) {
          this.items.set(
            item.id,
            Object.freeze({
              ...item,
              state: "paused",
            }),
          );

          continue;
        }

        this.items.set(
          item.id,
          Object.freeze({
            ...item,
          }),
        );
      }
    } catch {
      /*
       * A missing/corrupt queue
       * file should not prevent
       * Veyra from starting.
       */
    }
  }

  public async enqueue(
    modelId: string,
    destinationDirectory: string,
    priority = 0,
  ): Promise<DownloadQueueItem> {
    const model = this.modelResolver(modelId);

    if (!model) {
      throw new Error(`Cannot enqueue unknown model "${modelId}".`);
    }

    const existing = [...this.items.values()].find(
      (item) =>
        item.modelId === modelId && !isTerminalDownloadState(item.state),
    );

    if (existing) {
      return existing;
    }

    const item: DownloadQueueItem = Object.freeze({
      id: `${modelId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,

      modelId,

      destinationDirectory: path.resolve(destinationDirectory),

      state: "queued",

      bytesDownloaded: 0,

      totalBytes: model.artifact?.sizeBytes ?? null,

      percentage: model.artifact?.sizeBytes ? 0 : null,

      speedBytesPerSecond: 0,

      resumed: false,

      priority: Math.floor(priority),

      queuedAt: Date.now(),

      startedAt: null,

      completedAt: null,

      error: null,
    });

    this.items.set(item.id, item);

    await this.persist();

    this.schedulePump();

    return item;
  }

  public get(itemId: string): DownloadQueueItem | undefined {
    return this.items.get(itemId);
  }

  public list(): readonly DownloadQueueItem[] {
    return [...this.items.values()].sort(
      (a, b) => b.priority - a.priority || a.queuedAt - b.queuedAt,
    );
  }

  public async pause(itemId: string): Promise<void> {
    const item = this.getRequired(itemId);

    if (isTerminalDownloadState(item.state)) {
      return;
    }

    const controller = this.abortControllers.get(itemId);

    if (controller) {
      controller.abort();
    }

    this.setItem(item, {
      state: "paused",
      error: null,
    });

    await this.persist();
  }

  public async resume(itemId: string): Promise<void> {
    const item = this.getRequired(itemId);

    if (item.state !== "paused" && item.state !== "failed") {
      return;
    }

    this.setItem(item, {
      state: "queued",
      error: null,
      completedAt: null,
    });

    await this.persist();

    this.schedulePump();
  }

  public async cancel(itemId: string): Promise<void> {
    const item = this.getRequired(itemId);

    const controller = this.abortControllers.get(itemId);

    if (controller) {
      controller.abort();
    }

    const model = this.modelResolver(item.modelId);

    if (model?.artifact) {
      const partialPath = path.join(
        path.resolve(item.destinationDirectory),
        `${model.artifact.filename}.part`,
      );

      await this.downloader.removePartial(partialPath);
    }

    this.setItem(item, {
      state: "cancelled",
      completedAt: Date.now(),
      error: null,
    });

    await this.persist();
  }

  public async retry(itemId: string): Promise<void> {
    const item = this.getRequired(itemId);

    if (item.state !== "failed") {
      return;
    }

    this.setItem(item, {
      state: "queued",
      error: null,
      completedAt: null,
    });

    await this.persist();

    this.schedulePump();
  }

  public async clearCompleted(): Promise<void> {
    for (const item of this.items.values()) {
      if (item.state === "completed") {
        this.items.delete(item.id);
      }
    }

    await this.persist();
  }

  private schedulePump(): void {
    if (this.pumpScheduled) {
      return;
    }

    this.pumpScheduled = true;

    queueMicrotask(() => {
      this.pumpScheduled = false;

      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    while (this.runningCount < this.concurrency) {
      const next = this.list().find((item) => item.state === "queued");

      if (!next) {
        return;
      }

      this.runningCount += 1;

      void this.runItem(next).finally(() => {
        this.runningCount -= 1;
        this.schedulePump();
      });
    }
  }

  private async runItem(originalItem: DownloadQueueItem): Promise<void> {
    const model = this.modelResolver(originalItem.modelId);

    if (!model) {
      this.setItem(originalItem, {
        state: "failed",

        error: `Model "${originalItem.modelId}" is no longer registered.`,
      });

      await this.persist();

      return;
    }

    const controller = new AbortController();

    this.abortControllers.set(originalItem.id, controller);

    this.setItem(originalItem, {
      state: "preparing",

      startedAt: Date.now(),

      error: null,
    });

    await this.persist();

    try {
      const download = await this.downloader.download(model, {
        destinationDirectory: originalItem.destinationDirectory,

        signal: controller.signal,

        keepPartialOnAbort: true,

        onProgress: (progress) =>
          this.handleProgress(originalItem.id, progress),
      });

      const latest = this.getRequired(originalItem.id);

      if (latest.state === "paused") {
        return;
      }

      this.setItem(latest, {
        state: "completed",

        bytesDownloaded: download.bytesDownloaded,

        totalBytes: download.bytesDownloaded,

        percentage: 100,

        speedBytesPerSecond: 0,

        resumed: download.resumed,

        completedAt: Date.now(),

        error: null,
      });

      await this.persist();
    } catch (error) {
      const latest = this.getRequired(originalItem.id);

      if (latest.state === "paused") {
        await this.persist();

        return;
      }

      if (latest.state === "cancelled") {
        await this.persist();

        return;
      }

      const message =
        error instanceof Error ? error.message : "Model download failed.";

      this.setItem(latest, {
        state: "failed",

        error: message,
      });

      await this.persist();
    } finally {
      this.abortControllers.delete(originalItem.id);
    }
  }

  private handleProgress(
    itemId: string,
    progress: ModelDownloadProgress,
  ): void {
    const item = this.items.get(itemId);

    if (!item) {
      return;
    }

    let state: DownloadState = item.state;

    if (progress.phase === "preparing") {
      state = "preparing";
    } else if (progress.phase === "downloading") {
      state = "downloading";
    } else if (progress.phase === "verifying") {
      state = "verifying";
    }

    const updated = this.replaceItem(item, {
      state,

      bytesDownloaded: progress.bytesDownloaded,

      totalBytes: progress.totalBytes,

      percentage: progress.percentage,

      speedBytesPerSecond: progress.speedBytesPerSecond,

      resumed: progress.resumed,
    });

    this.onProgress?.({
      item: updated,
    });

    void this.persist();
  }

  private setItem(
    item: DownloadQueueItem,
    patch: Partial<DownloadQueueItem>,
  ): DownloadQueueItem {
    return this.replaceItem(item, patch);
  }

  private replaceItem(
    item: DownloadQueueItem,
    patch: Partial<DownloadQueueItem>,
  ): DownloadQueueItem {
    const updated: DownloadQueueItem = Object.freeze({
      ...item,
      ...patch,
    });

    this.items.set(item.id, updated);

    return updated;
  }

  private getRequired(itemId: string): DownloadQueueItem {
    const item = this.items.get(itemId);

    if (!item) {
      throw new Error(`Download queue item "${itemId}" was not found.`);
    }

    return item;
  }

  private async persist(): Promise<void> {
    const payload: PersistedQueue = Object.freeze({
      version: QUEUE_STATE_VERSION,

      items: Object.freeze(this.list()),
    });

    await fs.mkdir(path.dirname(this.stateFilePath), {
      recursive: true,
    });

    const temporaryPath = `${this.stateFilePath}.tmp`;

    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(payload, null, 2)}\n`,
      "utf8",
    );

    try {
      await fs.rename(temporaryPath, this.stateFilePath);
    } catch (error) {
      await fs.rm(temporaryPath, {
        force: true,
      });

      throw new Error("Failed to persist the Veyra model download queue.", {
        cause: error,
      });
    }
  }
}
