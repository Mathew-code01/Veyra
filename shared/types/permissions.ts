// ============================================================================
// FILE: shared/types/permissions.ts
//
// PURPOSE:
// Cross-platform permission types for VEYRA Desktop.
// Defines the permission model that works across Windows, macOS, and Linux.
// ============================================================================

import type { ISODateString } from "./common";

/**
 * Operating system identifiers.
 */
export type OperatingSystem = "win32" | "darwin" | "linux";

/**
 * Permission categories that VEYRA may request.
 */
export type PermissionCategory =
  | "microphone"
  | "screen-capture"
  | "camera"
  | "notifications"
  | "accessibility"
  | "documents"
  | "downloads";

/**
 * Permission state as reported by the operating system.
 */
export type PermissionState = "granted" | "denied" | "prompt" | "unknown";

/**
 * Current permission status for a specific category.
 */
export interface PermissionStatus {
  readonly category: PermissionCategory;
  readonly state: PermissionState;
  readonly lastChecked: ISODateString;
  readonly canRequest: boolean;
  readonly requiresSystemSettings: boolean;
}

/**
 * Platform-specific permission details.
 */
export interface PlatformPermissionDetails {
  readonly os: OperatingSystem;
  readonly osVersion: string;
  readonly permissions: readonly PermissionStatus[];
  readonly screenCaptureSupported: boolean;
  readonly accessibilitySupported: boolean;
}

/**
 * Permission request result.
 */
export interface PermissionRequestResult {
  readonly category: PermissionCategory;
  readonly state: PermissionState;
  readonly granted: boolean;
  readonly error?: string;
}

/**
 * Platform-specific guidance for enabling a denied permission.
 */
export interface PermissionFixGuide {
  readonly category: PermissionCategory;
  readonly os: OperatingSystem;
  readonly steps: readonly string[];
  readonly settingsUrl?: string;
  readonly settingsLabel?: string;
}

/**
 * Onboarding permission step configuration.
 */
export interface OnboardingPermissionStep {
  readonly category: PermissionCategory;
  readonly required: boolean;
  readonly title: string;
  readonly description: string;
  readonly reason: string;
  readonly learnMoreUrl?: string;
  readonly testAction?: string;
}

/**
 * Complete onboarding state including permissions.
 */
export interface OnboardingPermissionState {
  readonly currentStep: number;
  readonly completedSteps: readonly number[];
  readonly permissions: Record<PermissionCategory, PermissionState>;
  readonly platformDetails: PlatformPermissionDetails | null;
  readonly skippedCategories: readonly PermissionCategory[];
  readonly lastUpdated: ISODateString;
}