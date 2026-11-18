import type { HardwareAssessmentResponse, ModelInstallProgress } from "../../../../shared/types/hardware";

export type HardwareLoadResult =
  | { state: "ready"; assessment: HardwareAssessmentResponse }
  | { state: "partial"; assessment: HardwareAssessmentResponse }
  | { state: "unsupported" }
  | { state: "error"; error: string };

export function isHardwareBridgeAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.veyra?.hardware?.getAssessment);
}

export async function loadHardwareAssessment(options: { forceRefresh?: boolean } = {}): Promise<HardwareLoadResult> {
  if (typeof window === "undefined" || !window.veyra?.hardware?.getAssessment) {
    return { state: "unsupported" };
  }

  try {
    const result = await window.veyra.hardware.getAssessment({ forceRefresh: options.forceRefresh });
    if (!result || typeof result !== "object" || !result.profile || !Array.isArray(result.models) || !Array.isArray(result.runtimeNames)) {
      return {
        state: "error",
        error: "The Desktop returned an invalid hardware assessment. Retry the scan or restart VEYRA.",
      };
    }

    const cpuKnown = Boolean(result.profile.cpu?.brand) && Number.isFinite(result.profile.cpu?.logicalCores) && (result.profile.cpu.logicalCores ?? 0) > 0;
    const memoryKnown = Number.isFinite(result.profile.memory?.totalGB) && (result.profile.memory.totalGB ?? 0) > 0;
    const storageKnown = Number.isFinite(result.profile.storage?.freeGB);

    return {
      state: cpuKnown && memoryKnown && storageKnown ? "ready" : "partial",
      assessment: result,
    };
  } catch (cause) {
    return {
      state: "error",
      error: cause instanceof Error ? cause.message : "Hardware assessment could not be loaded.",
    };
  }
}

export async function installHardwareModel(modelId: string): Promise<{ installed: boolean }> {
  if (typeof window === "undefined" || !window.veyra?.hardware?.installModel) {
    throw new Error("Hardware installation service unavailable in this environment.");
  }
  return window.veyra.hardware.installModel(modelId);
}

export async function uninstallHardwareModel(modelId: string): Promise<{ removed: boolean }> {
  if (typeof window === "undefined" || !window.veyra?.hardware?.uninstallModel) {
    throw new Error("Hardware uninstall service unavailable in this environment.");
  }
  return window.veyra.hardware.uninstallModel(modelId);
}

export async function cancelHardwareInstall(modelId: string): Promise<{ cancelled: boolean }> {
  if (typeof window === "undefined" || !window.veyra?.hardware?.cancelInstall) {
    return { cancelled: false };
  }
  return window.veyra.hardware.cancelInstall(modelId);
}

export function subscribeHardwareInstallProgress(callback: (progress: ModelInstallProgress) => void): () => void {
  if (typeof window === "undefined" || !window.veyra?.hardware?.onInstallProgress) {
    return () => {};
  }
  return window.veyra.hardware.onInstallProgress(callback);
}
