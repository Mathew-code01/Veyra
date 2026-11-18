import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isHardwareBridgeAvailable,
  loadHardwareAssessment,
  installHardwareModel,
  uninstallHardwareModel,
  cancelHardwareInstall,
  subscribeHardwareInstallProgress,
} from "../../../client/src/services/ipc/hardwareClient";
import type { HardwareAssessmentResponse } from "../../../shared/types/hardware";

describe("Hardware Bridge Client (Renderer)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).window;
  });

  it("handles missing window or window.veyra safely without throwing", async () => {
    (globalThis as any).window = {};
    expect(isHardwareBridgeAvailable()).toBe(false);

    const result = await loadHardwareAssessment();
    expect(result).toEqual({ state: "unsupported" });
  });

  it("handles missing window.veyra.hardware safely without throwing", async () => {
    (globalThis as any).window = { veyra: {} };
    expect(isHardwareBridgeAvailable()).toBe(false);

    const result = await loadHardwareAssessment({ forceRefresh: true });
    expect(result).toEqual({ state: "unsupported" });

    await expect(installHardwareModel("model-1")).rejects.toThrow("unavailable in this environment");
    await expect(uninstallHardwareModel("model-1")).rejects.toThrow("unavailable in this environment");
    expect(await cancelHardwareInstall("model-1")).toEqual({ cancelled: false });

    const unsubscribe = subscribeHardwareInstallProgress(() => {});
    expect(typeof unsubscribe).toBe("function");
    expect(() => unsubscribe()).not.toThrow();
  });

  it("handles successful hardware assessment and classifies as ready", async () => {
    const mockAssessment: HardwareAssessmentResponse = {
      profile: {
        cpu: { brand: "Intel Core i7", logicalCores: 8, physicalCores: 4, baseFrequencyGHz: 2.8, maxFrequencyGHz: 4.7 },
        memory: { totalGB: 16, availableGB: 8, freeGB: 6 },
        gpus: [{ model: "RTX 3070", vendor: "NVIDIA", vramBytes: 8589934592, isDedicated: true }],
        storage: { freeGB: 100, totalGB: 512, appDataPath: "C:\\Users\\test" },
        tier: "mid",
      },
      models: [],
      runtimeNames: ["onnx", "llama_cpp"],
      localRuntimeReady: true,
      assessedAt: new Date().toISOString(),
    };

    const getAssessmentMock = vi.fn().mockResolvedValue(mockAssessment);
    (globalThis as any).window = {
      veyra: {
        hardware: {
          getAssessment: getAssessmentMock,
        },
      },
    };

    expect(isHardwareBridgeAvailable()).toBe(true);

    const result = await loadHardwareAssessment();
    expect(result.state).toBe("ready");
    if (result.state === "ready") {
      expect(result.assessment).toBe(mockAssessment);
    }
    expect(getAssessmentMock).toHaveBeenCalledWith({ forceRefresh: undefined });
  });

  it("handles retry with forceRefresh=true", async () => {
    const mockAssessment: HardwareAssessmentResponse = {
      profile: {
        cpu: { brand: "AMD Ryzen 7", logicalCores: 16, physicalCores: 8, baseFrequencyGHz: 3.8 },
        memory: { totalGB: 32, availableGB: 20 },
        storage: { freeGB: 250, totalGB: 1024, appDataPath: "C:\\test" },
        tier: "high",
      },
      models: [],
      runtimeNames: ["llama_cpp"],
      localRuntimeReady: true,
      assessedAt: new Date().toISOString(),
    };

    const getAssessmentMock = vi.fn().mockResolvedValue(mockAssessment);
    (globalThis as any).window = {
      veyra: {
        hardware: {
          getAssessment: getAssessmentMock,
        },
      },
    };

    const result = await loadHardwareAssessment({ forceRefresh: true });
    expect(result.state).toBe("ready");
    expect(getAssessmentMock).toHaveBeenCalledWith({ forceRefresh: true });
  });

  it("handles partial hardware information gracefully", async () => {
    const partialAssessment: HardwareAssessmentResponse = {
      profile: {
        cpu: undefined,
        memory: { totalGB: 8 },
        storage: undefined,
        tier: "unsupported",
      },
      models: [],
      runtimeNames: [],
      localRuntimeReady: false,
      assessedAt: new Date().toISOString(),
    };

    (globalThis as any).window = {
      veyra: {
        hardware: {
          getAssessment: vi.fn().mockResolvedValue(partialAssessment),
        },
      },
    };

    const result = await loadHardwareAssessment();
    expect(result.state).toBe("partial");
  });

  it("handles failed assessment without crashing", async () => {
    (globalThis as any).window = {
      veyra: {
        hardware: {
          getAssessment: vi.fn().mockRejectedValue(new Error("IPC connection lost")),
        },
      },
    };

    const result = await loadHardwareAssessment();
    expect(result).toEqual({
      state: "error",
      error: "IPC connection lost",
    });
  });

  it("delegates install, uninstall, and progress subscription to bridge", async () => {
    const installMock = vi.fn().mockResolvedValue({ installed: true });
    const uninstallMock = vi.fn().mockResolvedValue({ removed: true });
    const cancelMock = vi.fn().mockResolvedValue({ cancelled: true });
    const onProgressMock = vi.fn().mockReturnValue(() => {});

    (globalThis as any).window = {
      veyra: {
        hardware: {
          installModel: installMock,
          uninstallModel: uninstallMock,
          cancelInstall: cancelMock,
          onInstallProgress: onProgressMock,
        },
      },
    };

    await expect(installHardwareModel("qwen-2.5")).resolves.toEqual({ installed: true });
    expect(installMock).toHaveBeenCalledWith("qwen-2.5");

    await expect(uninstallHardwareModel("qwen-2.5")).resolves.toEqual({ removed: true });
    expect(uninstallMock).toHaveBeenCalledWith("qwen-2.5");

    await expect(cancelHardwareInstall("qwen-2.5")).resolves.toEqual({ cancelled: true });
    expect(cancelMock).toHaveBeenCalledWith("qwen-2.5");

    const callback = vi.fn();
    const unsub = subscribeHardwareInstallProgress(callback);
    expect(onProgressMock).toHaveBeenCalledWith(callback);
    expect(typeof unsub).toBe("function");
  });
});
