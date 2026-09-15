// ============================================================================
// FILE: core/cloud/CloudHttpClient.ts
// PURPOSE:
// Small production-safe HTTP abstraction used by cloud providers.
//
// RESPONSIBILITIES:
// - timeout handling
// - AbortSignal handling
// - JSON requests
// - binary responses
// - SSE/stream access
// - normalized HTTP errors
//
// DOES NOT:
// - retry
// - select providers
// - make routing decisions
// - contain API keys
// ============================================================================

import { CloudError } from "./contracts/CloudError";

export interface CloudHttpRequest {
  readonly url: string;
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: BodyInit | null;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface CloudHttpJsonRequest<TBody = unknown> extends Omit<
  CloudHttpRequest,
  "body"
> {
  readonly body?: TBody;
}

export class CloudHttpClient {
  private static readonly DEFAULT_TIMEOUT_MS = 30_000;

  private createTimeoutSignal(
    timeoutMs: number,
    externalSignal?: AbortSignal,
  ): {
    readonly signal: AbortSignal;
    readonly cleanup: () => void;
  } {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort(
        new DOMException(
          `Cloud request timed out after ${timeoutMs}ms.`,
          "TimeoutError",
        ),
      );
    }, timeoutMs);

    const abortFromExternal = () => {
      controller.abort(externalSignal?.reason);
    };

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener("abort", abortFromExternal, {
          once: true,
        });
      }
    }

    return {
      signal: controller.signal,
      cleanup: () => {
        clearTimeout(timeout);

        if (externalSignal) {
          externalSignal.removeEventListener("abort", abortFromExternal);
        }
      },
    };
  }

  private async parseErrorBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";

    try {
      if (contentType.includes("application/json")) {
        return await response.json();
      }

      return await response.text();
    } catch {
      return undefined;
    }
  }

  private async request(request: CloudHttpRequest): Promise<Response> {
    const timeoutMs = request.timeoutMs ?? CloudHttpClient.DEFAULT_TIMEOUT_MS;

    const { signal, cleanup } = this.createTimeoutSignal(
      timeoutMs,
      request.signal,
    );

    const startedAt = Date.now();

    try {
      const response = await fetch(request.url, {
        method: request.method ?? "GET",
        headers: request.headers,
        body: request.body,
        signal,
      });

      if (!response.ok) {
        const body = await this.parseErrorBody(response);

        throw CloudError.fromHttpResponse({
          status: response.status,
          statusText: response.statusText,
          body,
          url: request.url,
          durationMs: Date.now() - startedAt,
        });
      }

      return response;
    } catch (error) {
      if (error instanceof CloudError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new CloudError(
          `Cloud request timed out after ${timeoutMs}ms.`,
          "TIMEOUT",
          {
            retryable: true,
            cause: error,
            details: {
              url: request.url,
              durationMs: Date.now() - startedAt,
            },
          },
        );
      }

      if (
        request.signal?.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        throw new CloudError("Cloud request was aborted.", "ABORTED", {
          retryable: false,
          cause: error,
          details: {
            url: request.url,
          },
        });
      }

      throw new CloudError(
        error instanceof Error ? error.message : "Unknown cloud network error.",
        "NETWORK",
        {
          retryable: true,
          cause: error,
          details: {
            url: request.url,
            durationMs: Date.now() - startedAt,
          },
        },
      );
    } finally {
      cleanup();
    }
  }

  public async json<TResponse>(
    request: CloudHttpJsonRequest,
  ): Promise<TResponse> {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(request.headers ?? {}),
    };

    const response = await this.request({
      ...request,
      headers,
      body:
        request.body === undefined ? undefined : JSON.stringify(request.body),
    });

    try {
      return (await response.json()) as TResponse;
    } catch (error) {
      throw new CloudError(
        "Cloud provider returned invalid JSON.",
        "INVALID_RESPONSE",
        {
          retryable: false,
          cause: error,
          details: {
            url: request.url,
          },
        },
      );
    }
  }

  public async binary(request: CloudHttpRequest): Promise<Uint8Array> {
    const response = await this.request({
      ...request,
      headers: {
        Accept: "*/*",
        ...(request.headers ?? {}),
      },
    });

    return new Uint8Array(await response.arrayBuffer());
  }

  public async raw(request: CloudHttpRequest): Promise<Response> {
    return this.request(request);
  }

  public async stream(
    request: CloudHttpRequest,
  ): Promise<ReadableStream<Uint8Array>> {
    const response = await this.request({
      ...request,
      headers: {
        Accept: "text/event-stream",
        ...(request.headers ?? {}),
      },
    });

    if (!response.body) {
      throw new CloudError(
        "Cloud provider returned an empty streaming body.",
        "INVALID_RESPONSE",
        {
          retryable: false,
          details: {
            url: request.url,
          },
        },
      );
    }

    return response.body;
  }
}
