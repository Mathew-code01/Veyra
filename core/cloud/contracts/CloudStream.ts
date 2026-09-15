// ============================================================================
// FILE: core/cloud/contracts/CloudStream.ts
// ============================================================================

export type CloudStreamEventType =
  | "text_delta"
  | "audio_delta"
  | "metadata"
  | "usage"
  | "tool_call"
  | "error"
  | "done";

export interface CloudStreamEvent<T = unknown> {
  readonly type: CloudStreamEventType;

  readonly data?: T;

  readonly sequence: number;

  readonly providerId: string;

  readonly model?: string;

  readonly timestamp: number;
}

export interface CloudStream<T = unknown> extends AsyncIterable<
  CloudStreamEvent<T>
> {
  readonly providerId: string;

  readonly model?: string;

  readonly startedAt: number;

  readonly cancel: () => void;
}
