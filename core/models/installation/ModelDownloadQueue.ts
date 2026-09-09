// core/models/installation/ModelDownloadQueue.ts

import { promises as fs } from "node:fs";
import path from "node:path";

import type { ModelDefinition } from "../ModelRegistry";

import {
  ModelDownloader,
  type ModelDownloadProgress,
  type ModelDownloadResult,
} from "../ModelDownloader";

import {
  isTerminalDownloadState,
  type DownloadQueueItem,
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

  readonly persistenceDebounceMs?: number;
}

interface PersistedQueue {
  readonly version: 1;

  readonly items: readonly DownloadQueueItem[];
}

interface QueueWaiter {
  readonly resolve: (item: DownloadQueueItem) => void;

  readonly reject: (error: unknown) => void;
}

const QUEUE_STATE_VERSION = 1 as const;

const DEFAULT_PERSISTENCE_DEBOUNCE_MS = 750;

const DEFAULT_WAIT_POLL_MS = 100;

export class ModelDownloadQueue {
  private readonly items = new Map<string, DownloadQueueItem>();

  private readonly abortControllers = new Map<string, AbortController>();

  private readonly results = new Map<string, ModelDownloadResult>();

  private readonly waiters = new Map<string, QueueWaiter[]>();

  private readonly modelResolver: ModelDownloadQueueOptions["modelResolver"];

  private readonly stateFilePath: string;

  private readonly concurrency: number;

  private readonly downloader: ModelDownloader;

  private readonly onProgress?: ModelDownloadQueueOptions["onProgress"];

  private readonly persistenceDebounceMs: number;

  private persistenceTimer: ReturnType<typeof setTimeout> | null = null;

  private persistencePromise: Promise<void> | null = null;

  private persistenceRequested = false;

  private runningCount = 0;

  private pumpScheduled = false;

  private initialized = false;

  public constructor(options: ModelDownloadQueueOptions) {
    this.modelResolver = options.modelResolver;

    this.stateFilePath = path.resolve(options.stateFilePath);

    this.concurrency = Math.max(1, Math.floor(options.concurrency ?? 1));

    this.downloader = options.downloader ?? new ModelDownloader();

    this.onProgress = options.onProgress;

    this.persistenceDebounceMs = Math.max(
      100,
      Math.floor(
        options.persistenceDebounceMs ?? DEFAULT_PERSISTENCE_DEBOUNCE_MS,
      ),
    );
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await fs.mkdir(path.dirname(this.stateFilePath), {
      recursive: true,
    });

    try {
      const content = await fs.readFile(this.stateFilePath, "utf8");

      const parsed: unknown = JSON.parse(content);

      if (parsed && typeof parsed === "object") {
        const queue = parsed as Partial<PersistedQueue>;

        if (
          queue.version === QUEUE_STATE_VERSION &&
          Array.isArray(queue.items)
        ) {
          for (const item of queue.items) {
            if (!item || typeof item !== "object") {
              continue;
            }

            const restored = item as DownloadQueueItem;

            /*
             * A process cannot continue
             * executing after Veyra exits.
             *
             * Therefore active states are
             * restored as paused.
             */
            const state =
              restored.state === "downloading" ||
              restored.state === "preparing" ||
              restored.state === "verifying"
                ? "paused"
                : restored.state;

            this.items.set(
              restored.id,
              Object.freeze({
                ...restored,
                state,
              }),
            );
          }
        }
      }
    } catch {
      /*
       * A missing or malformed queue
       * must never prevent Veyra from
       * starting.
       */
    }

    this.initialized = true;

    this.schedulePump();
  }

  public async enqueue(
    modelId: string,
    destinationDirectory: string,
    priority = 0,
  ): Promise<DownloadQueueItem> {
    await this.ensureInitialized();

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

    const normalizedDirectory = path.resolve(destinationDirectory);

    const item: DownloadQueueItem = Object.freeze({
      id: `${modelId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,

      modelId,

      destinationDirectory: normalizedDirectory,

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

    await this.persistNow();

    this.schedulePump();

    return item;
  }

  public get(itemId: string): DownloadQueueItem | undefined {
    return this.items.get(itemId);
  }

  public getResult(itemId: string): ModelDownloadResult | undefined {
    return this.results.get(itemId);
  }

  public list(): readonly DownloadQueueItem[] {
    return [...this.items.values()].sort(
      (a, b) => b.priority - a.priority || a.queuedAt - b.queuedAt,
    );
  }

  public async waitForCompletion(itemId: string): Promise<DownloadQueueItem> {
    await this.ensureInitialized();

    const current = this.getRequired(itemId);

    if (current.state === "completed") {
      return current;
    }

    if (current.state === "failed") {
      throw new Error(current.error ?? `Download "${itemId}" failed.`);
    }

    if (current.state === "cancelled") {
      throw new DOMException(
        `Download "${itemId}" was cancelled.`,
        "AbortError",
      );
    }

    return new Promise((resolve, reject) => {
      const existing = this.waiters.get(itemId) ?? [];

      existing.push({
        resolve,
        reject,
      });

      this.waiters.set(itemId, existing);

      /*
       * The completion event is driven
       * by runItem(). This fallback timer
       * protects callers if a queue item
       * was externally mutated.
       */
      void this.monitorWaiter(itemId);
    });
  }

  public async pause(itemId: string): Promise<void> {
    const item = this.getRequired(itemId);

    if (isTerminalDownloadState(item.state)) {
      return;
    }

    this.abortControllers.get(itemId)?.abort();

    this.replaceItem(item, {
      state: "paused",
      error: null,
    });

    await this.persistNow();

    this.resolveWaitersForCurrentState(itemId);
  }

  public async resume(itemId: string): Promise<void> {
    const item = this.getRequired(itemId);

    if (item.state !== "paused" && item.state !== "failed") {
      return;
    }

    this.replaceItem(item, {
      state: "queued",
      error: null,
      completedAt: null,
    });

    await this.persistNow();

    this.schedulePump();
  }

  public async cancel(itemId: string): Promise<void> {
    const item = this.getRequired(itemId);

    this.abortControllers.get(itemId)?.abort();

    const model = this.modelResolver(item.modelId);

    if (model?.artifact) {
      const partialPath = path.join(
        path.resolve(item.destinationDirectory),
        `${model.artifact.filename}.part`,
      );

      await this.downloader.removePartial(partialPath);
    }

    this.replaceItem(item, {
      state: "cancelled",
      completedAt: Date.now(),
      error: null,
    });

    await this.persistNow();

    this.resolveWaitersForCurrentState(itemId);
  }

  public async retry(itemId: string): Promise<void> {
    const item = this.getRequired(itemId);

    if (item.state !== "failed") {
      return;
    }

    this.replaceItem(item, {
      state: "queued",
      error: null,
      completedAt: null,
    });

    await this.persistNow();

    this.schedulePump();
  }

  public async clearCompleted(): Promise<void> {
    for (const item of this.items.values()) {
      if (item.state === "completed") {
        this.items.delete(item.id);

        this.results.delete(item.id);
      }
    }

    await this.persistNow();
  }

  public async flushPersistence(): Promise<void> {
    await this.persistNow();
  }

  public async dispose(): Promise<void> {
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }

    await this.persistNow();

    for (const itemId of this.waiters.keys()) {
      this.rejectWaiters(
        itemId,
        new Error("Veyra model download queue was disposed."),
      );
    }

    this.waiters.clear();
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
      this.replaceItem(originalItem, {
        state: "failed",
        error: `Model "${originalItem.modelId}" is no longer registered.`,
      });

      await this.persistNow();

      this.resolveWaitersForCurrentState(originalItem.id);

      return;
    }

    const controller = new AbortController();

    this.abortControllers.set(originalItem.id, controller);

    this.replaceItem(originalItem, {
      state: "preparing",
      startedAt: Date.now(),
      error: null,
    });

    await this.persistNow();

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

      if (latest.state === "cancelled") {
        return;
      }

      this.results.set(originalItem.id, download);

      const completed = this.replaceItem(latest, {
        state: "completed",

        bytesDownloaded: download.bytesDownloaded,

        totalBytes: download.bytesDownloaded,

        percentage: 100,

        speedBytesPerSecond: 0,

        resumed: download.resumed,

        completedAt: Date.now(),

        error: null,
      });

      await this.persistNow();

      this.resolveWaiters(originalItem.id, completed);
    } catch (error) {
      const latest = this.getRequired(originalItem.id);

      if (latest.state === "paused") {
        await this.persistNow();

        this.resolveWaitersForCurrentState(originalItem.id);

        return;
      }

      if (latest.state === "cancelled") {
        await this.persistNow();

        this.resolveWaitersForCurrentState(originalItem.id);

        return;
      }

      const message =
        error instanceof Error ? error.message : "Model download failed.";

      const failed = this.replaceItem(latest, {
        state: "failed",
        error: message,
      });

      await this.persistNow();

      this.rejectWaiters(originalItem.id, error);

      void failed;
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

    let state = item.state;

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

    this.schedulePersistence();
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

  private schedulePersistence(): void {
    this.persistenceRequested = true;

    if (this.persistenceTimer) {
      return;
    }

    this.persistenceTimer = setTimeout(() => {
      this.persistenceTimer = null;

      if (this.persistenceRequested) {
        this.persistenceRequested = false;

        void this.persistNow();
      }
    }, this.persistenceDebounceMs);
  }

  private async persistNow(): Promise<void> {
    this.persistenceRequested = false;

    if (this.persistenceTimer) {
      clearTimeout(this.persistenceTimer);

      this.persistenceTimer = null;
    }

    if (this.persistencePromise) {
      await this.persistencePromise;
    }

    const payload: PersistedQueue = Object.freeze({
      version: QUEUE_STATE_VERSION,

      items: Object.freeze(this.list()),
    });

    const write = this.writePersistedQueue(payload);

    this.persistencePromise = write;

    try {
      await write;
    } finally {
      if (this.persistencePromise === write) {
        this.persistencePromise = null;
      }
    }
  }

  private async writePersistedQueue(payload: PersistedQueue): Promise<void> {
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

      throw new Error(
        "Failed to atomically persist the Veyra model download queue.",
        {
          cause: error,
        },
      );
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private resolveWaiters(itemId: string, item: DownloadQueueItem): void {
    const waiters = this.waiters.get(itemId);

    if (!waiters) {
      return;
    }

    this.waiters.delete(itemId);

    for (const waiter of waiters) {
      waiter.resolve(item);
    }
  }

  private rejectWaiters(itemId: string, error: unknown): void {
    const waiters = this.waiters.get(itemId);

    if (!waiters) {
      return;
    }

    this.waiters.delete(itemId);

    for (const waiter of waiters) {
      waiter.reject(error);
    }
  }

  private resolveWaitersForCurrentState(itemId: string): void {
    const item = this.items.get(itemId);

    if (!item) {
      return;
    }

    if (item.state === "completed") {
      this.resolveWaiters(itemId, item);

      return;
    }

    if (item.state === "failed") {
      this.rejectWaiters(
        itemId,
        new Error(item.error ?? `Download "${itemId}" failed.`),
      );

      return;
    }

    if (item.state === "cancelled") {
      this.rejectWaiters(
        itemId,
        new DOMException(`Download "${itemId}" was cancelled.`, "AbortError"),
      );
    }
  }

  private async monitorWaiter(itemId: string): Promise<void> {
    while (this.waiters.has(itemId)) {
      const item = this.items.get(itemId);

      if (!item) {
        this.rejectWaiters(
          itemId,
          new Error(`Download queue item "${itemId}" disappeared.`),
        );

        return;
      }

      if (item.state === "completed") {
        this.resolveWaiters(itemId, item);

        return;
      }

      if (item.state === "failed") {
        this.rejectWaiters(
          itemId,
          new Error(item.error ?? `Download "${itemId}" failed.`),
        );

        return;
      }

      if (item.state === "cancelled") {
        this.rejectWaiters(
          itemId,
          new DOMException(`Download "${itemId}" was cancelled.`, "AbortError"),
        );

        return;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, DEFAULT_WAIT_POLL_MS);
      });
    }
  }
}
