// ============================================================================
// FILE: core/documents/pipeline/DocumentProcessingJob.ts
// PURPOSE:
// Represents an asynchronous document-processing job.
//
// This is intentionally independent from:
// - BullMQ
// - Electron IPC
// - database queues
// - worker threads
//
// Those can be adapters later.
// ============================================================================

import type { DocumentProcessingRequest } from "../DocumentTypes";

export type DocumentProcessingJobStatus =
  "queued" | "running" | "completed" | "failed" | "cancelled";

export interface DocumentProcessingJob {
  readonly id: string;

  readonly request: DocumentProcessingRequest;

  readonly status: DocumentProcessingJobStatus;

  readonly createdAt: string;

  readonly startedAt?: string;

  readonly completedAt?: string;

  readonly error?: unknown;
}

export interface DocumentJobStore {
  create(job: DocumentProcessingJob): Promise<void>;

  getById(jobId: string): Promise<DocumentProcessingJob | null>;

  update(
    jobId: string,
    update: Partial<Omit<DocumentProcessingJob, "id" | "request">>,
  ): Promise<void>;
}
