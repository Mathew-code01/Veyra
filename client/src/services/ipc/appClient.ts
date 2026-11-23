// ============================================================================
// FILE: client/src/services/ipc/appClient.ts
//
// PURPOSE:
// App-level IPC client for platform details and system permissions.
// ============================================================================

import type { OperatingSystem } from "../../../../shared/types/permissions";

export interface PlatformDetailsResult {
  readonly os: OperatingSystem;
  readonly osVersion: string;
  readonly screenCaptureSupported: boolean;
  readonly accessibilitySupported: boolean;
}

export interface NotificationPermissionResult {
  readonly granted: boolean;
  readonly state: "granted" | "denied" | "default";
}

export async function getPlatformDetails(): Promise<{
  success: boolean;
  data?: { os: string; osVersion: string; screenCaptureSupported: boolean; accessibilitySupported: boolean };
  error?: string;
}> {
  if (!window.veyra?.app?.getPlatformDetails) {
    return { success: false, error: "Platform details not available." };
  }
  return window.veyra.app.getPlatformDetails();
}

export async function getNotificationPermission(): Promise<NotificationPermissionResult> {
  if (!window.veyra?.app?.getNotificationPermission) {
    return { granted: false, state: "default" };
  }
  return window.veyra.app.getNotificationPermission();
}

export async function requestNotificationPermission(): Promise<{
  success: boolean;
  data?: { state: "granted" | "denied" | "default" };
  error?: string;
}> {
  if (!window.veyra?.app?.requestNotificationPermission) {
    return { success: false, error: "Notification permission not available." };
  }
  return window.veyra.app.requestNotificationPermission();
}

export async function testNotification(): Promise<{ success: boolean; error?: string }> {
  if (!window.veyra?.app?.testNotification) {
    return { success: false, error: "Test notification not available." };
  }
  return window.veyra.app.testNotification();
}