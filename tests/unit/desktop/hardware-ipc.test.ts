import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMain } from "electron";
import { HARDWARE_IPC_CHANNELS } from "../../../shared/contracts/hardware.contract";
import { registerHardwareIpc } from "../../../desktop/ipc/hardware.ipc";
import type { HardwareService } from "../../../desktop/services/ai/HardwareService";

function makeIpc() {
  const handlers = new Map<string, (...args: any[]) => any>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => handlers.set(channel, handler)),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
  } as unknown as IpcMain;
  return { ipcMain, handlers };
}

const sender = { isDestroyed: () => false, send: vi.fn() };
const event = { sender } as any;

describe("hardware assessment/install IPC", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates the hardware assessment to the existing service", async () => {
    const assessment = { models: [] } as any;
    const service = { getAssessment: vi.fn().mockResolvedValue(assessment) } as unknown as HardwareService;
    const { ipcMain, handlers } = makeIpc();
    const cleanup = registerHardwareIpc({ service, ipcMain: ipcMain });
    await expect(handlers.get(HARDWARE_IPC_CHANNELS.GET_ASSESSMENT)!(event, { forceRefresh: true })).resolves.toBe(assessment);
    expect(service.getAssessment).toHaveBeenCalledWith(true);
    cleanup();
  });

  it("rejects untrusted model IDs before reaching the model manager", async () => {
    const manager = { getModel: vi.fn() };
    const service = { getModelManager: () => manager } as unknown as HardwareService;
    const { ipcMain, handlers } = makeIpc();
    const cleanup = registerHardwareIpc({ service, ipcMain: ipcMain });
    await expect(handlers.get(HARDWARE_IPC_CHANNELS.INSTALL_MODEL)!(event, { modelId: "../secret" })).rejects.toThrow("valid model");
    expect(manager.getModel).not.toHaveBeenCalled();
    cleanup();
  });

  it("requires exact package hashes and only streams safe progress fields", async () => {
    const model = { id: "model-a", availability: "available", modality: "llm", runtime: "llama_cpp", package: { artifacts: [{ role: "model", sizeBytes: 12, sha256: "a".repeat(64) }] } };
    const manager = {
      getModel: vi.fn().mockReturnValue(model),
      evaluateModel: vi.fn().mockReturnValue({ level: "compatible", blockingReasons: [] }),
      install: vi.fn(async (_id, options) => options.onProgress({ modelId: "model-a", filename: "model.gguf", bytesDownloaded: 12, totalBytes: 12, percentage: 100, speedBytesPerSecond: 1, resumed: false, phase: "verifying" })),
      isInstalled: vi.fn().mockReturnValue(true),
    };
    const service = { getModelManager: () => manager, getProfile: vi.fn().mockResolvedValue({}) } as unknown as HardwareService;
    const { ipcMain, handlers } = makeIpc();
    const cleanup = registerHardwareIpc({ service, ipcMain: ipcMain });
    await expect(handlers.get(HARDWARE_IPC_CHANNELS.INSTALL_MODEL)!(event, { modelId: "model-a" })).resolves.toEqual({ installed: true });
    expect(manager.install).toHaveBeenCalledWith("model-a", expect.objectContaining({ requireMemorySafety: true, signal: expect.any(AbortSignal), onProgress: expect.any(Function) }));
    expect(sender.send).toHaveBeenCalledWith(HARDWARE_IPC_CHANNELS.INSTALL_PROGRESS, expect.objectContaining({ modelId: "model-a", phase: "verifying" }));
    cleanup();
  });
});
