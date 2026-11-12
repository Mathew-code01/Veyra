// shared/contracts/context.contract.ts
// Cross-boundary context contracts (IPC/server-safe).

import type { Result } from "../types/common";
import type {
  CompressedContext,
  ContextQuery,
  RankedContext,
  RetrievedContext,
} from "../../core/context/contracts/ContextQuery";

/** IPC-safe context query (no AbortSignal). */
export type ContextQueryRequest = Omit<ContextQuery, "signal">;

export interface ContextQueryResponse {
  readonly query: string;
  readonly retrieved: readonly RetrievedContext[];
  readonly contexts: readonly RankedContext[];
  readonly compressed: CompressedContext;
}

export type ContextQueryResult = Result<ContextQueryResponse>;
