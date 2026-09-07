// core/reliability/BackpressureManager.ts

export interface BackpressureOptions {
  maxConcurrent?: number;
  maxQueueSize?: number;
}

interface QueueItem<T> {
  operation: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

export class BackpressureManager {
  private readonly maxConcurrent: number;
  private readonly maxQueueSize: number;

  private active = 0;

  private readonly queue: QueueItem<unknown>[] = [];

  constructor(options: BackpressureOptions = {}) {
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 2);

    this.maxQueueSize = Math.max(1, options.maxQueueSize ?? 20);
  }

  getActiveCount(): number {
    return this.active;
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active < this.maxConcurrent) {
      return this.run(operation);
    }

    if (this.queue.length >= this.maxQueueSize) {
      return Promise.reject(new Error("Backpressure queue is full."));
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        operation,
        resolve,
        reject,
      } as QueueItem<unknown>);
    });
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    this.active++;

    try {
      return await operation();
    } finally {
      this.active--;
      this.drain();
    }
  }

  private drain(): void {
    while (this.active < this.maxConcurrent && this.queue.length) {
      const item = this.queue.shift();

      if (!item) {
        return;
      }

      void this.run(item.operation).then(item.resolve).catch(item.reject);
    }
  }
}