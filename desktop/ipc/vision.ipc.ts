// ============================================================================
// FILE: desktop/ipc/vision.ipc.ts
//
// PURPOSE:
// Secure vision analysis IPC boundary.
//
// MAIN PROCESS ONLY.
//
// SECURITY:
// - Renderer cannot provide arbitrary filesystem paths for analysis.
// - Vision execution uses configured providers; cloud execution remains
//   governed by existing AI/cloud policy (deny-by-default where applicable).
// - Raw image bytes, when provided, are treated as untrusted input and
//   validated before analysis.
// - This handler does not upload screenshots externally unless the
//   underlying authorized vision/provider path explicitly permits it.
// ============================================================================

import type { IpcMain, IpcMainInvokeEvent } from "electron";

import { IPC_CHANNELS } from "../../shared/constants/events";

import type { VisionAnalysisRequest, VisionAnalysisResult } from "../../shared/types/vision";

import { VisionPipeline } from "../../core/vision/pipeline/VisionPipeline";

export interface RegisterVisionIpcOptions {
  readonly ipcMain: IpcMain;
  readonly visionPipeline?: VisionPipeline;
}

function assertValidIpcSender(event: IpcMainInvokeEvent): void {
  if (event.sender.isDestroyed()) {
    throw new Error("Veyra IPC request rejected: sender is no longer available.");
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeRequest(input: unknown): VisionAnalysisRequest {
  const req = asObject(input);
  const image = asObject(req.image);
  const data = image.data;

  let bytes: Uint8Array;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (Array.isArray(data)) {
    bytes = Uint8Array.from(data as number[]);
  } else if (typeof data === "string") {
    // Allow base64 payloads from renderer in a controlled format.
    const base64 = data.includes(",") ? data.split(",").pop() ?? "" : data;
    bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  } else {
    throw new Error("Vision image data is required.");
  }

  const mimeType = typeof image.mimeType === "string" ? image.mimeType : "image/png";

  return {
    id: typeof req.id === "string" && req.id.trim() ? req.id : `vision-${Date.now()}`,
    image: {
      data: bytes,
      mimeType,
      width: typeof image.width === "number" ? image.width : undefined,
      height: typeof image.height === "number" ? image.height : undefined,
    },
    source: req.source as VisionAnalysisRequest["source"],
    question: typeof req.question === "string" ? req.question : undefined,
    useOCR: typeof req.useOCR === "boolean" ? req.useOCR : undefined,
    language: typeof req.language === "string" ? req.language : undefined,
    detail: req.detail as VisionAnalysisRequest["detail"],
    providerName: typeof req.providerName === "string" ? req.providerName : undefined,
    modelName: typeof req.modelName === "string" ? req.modelName : undefined,
    metadata: req.metadata as VisionAnalysisRequest["metadata"],
  };
}

export function registerVisionIpc(options: RegisterVisionIpcOptions): () => void {
  const { ipcMain, visionPipeline } = options;

  const analyzeHandler = async (event: IpcMainInvokeEvent, request?: unknown) => {
    try {
      assertValidIpcSender(event);

      if (!visionPipeline) {
        return {
          success: false,
          error: new Error("Vision analysis is not available: no vision pipeline configured."),
          code: "VISION_UNAVAILABLE",
        };
      }

      const normalized = normalizeRequest(request);
      const result: VisionAnalysisResult = await visionPipeline.analyze(normalized);

      return {
        success: true,
        data: { result },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        success: false,
        error: err,
        message: err.message,
      };
    }
  };

  ipcMain.handle(IPC_CHANNELS.VISION_ANALYZE, analyzeHandler);

  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.VISION_ANALYZE);
  };
}
