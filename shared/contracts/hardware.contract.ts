// Relative path: shared/contracts/hardware.contract.ts

import type {
  HardwareModelPlanResponse,
  HardwareSnapshotResponse,
} from "../types/hardware";

export const HARDWARE_IPC_CHANNELS = Object.freeze({
  GET_PROFILE: "veyra:hardware:get-profile",
  REFRESH_PROFILE: "veyra:hardware:refresh-profile",
  GET_MODEL_PLAN: "veyra:hardware:get-model-plan",
  GET_ASSESSMENT: "veyra:hardware:get-assessment",
  INSTALL_MODEL: "veyra:hardware:install-model",
  UNINSTALL_MODEL: "veyra:hardware:uninstall-model",
  CANCEL_INSTALL: "veyra:hardware:cancel-install",
  INSTALL_PROGRESS: "veyra:hardware:install-progress",
} as const);

export type HardwareIpcChannel =
  (typeof HARDWARE_IPC_CHANNELS)[keyof typeof HARDWARE_IPC_CHANNELS];

export interface HardwareGetProfileRequest {
  readonly forceRefresh?: boolean;
}

export interface HardwareGetModelPlanRequest {
  readonly forceRefresh?: boolean;
}

export type HardwareGetProfileResponse = HardwareSnapshotResponse;

export type HardwareGetModelPlanResponse = HardwareModelPlanResponse;
