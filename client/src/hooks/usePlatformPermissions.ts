// ============================================================================
// FILE: client/src/hooks/usePlatformPermissions.ts
//
// PURPOSE:
// Cross-platform permission management hook for VEYRA Desktop onboarding.
// Handles Windows, macOS, and Linux permission differences.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, HelpCircle, Info, ShieldAlert } from "lucide-react";

import type {
  OperatingSystem,
  PermissionCategory,
  PermissionState,
  PermissionStatus,
  PlatformPermissionDetails,
  PermissionFixGuide,
} from "../../../shared/types/permissions";

const PERMISSION_CATEGORIES: PermissionCategory[] = [
  "microphone",
  "screen-capture",
  "camera",
  "notifications",
  "accessibility",
  "documents",
  "downloads",
];

function getCurrentOS(): OperatingSystem {
  if (typeof window === "undefined") return "win32";
  const platform = navigator.platform.toLowerCase();
  if (platform.includes("mac")) return "darwin";
  if (platform.includes("linux")) return "linux";
  return "win32";
}

function getSettingsUrl(category: PermissionCategory, os: OperatingSystem): string | undefined {
  if (os === "win32") {
    switch (category) {
      case "microphone":
        return "ms-settings:privacy-microphone";
      case "camera":
        return "ms-settings:privacy-webcam";
      case "notifications":
        return "ms-settings:notifications";
      case "screen-capture":
        return "ms-settings:privacy-appsforweb";
      case "documents":
        return "ms-settings:privacy-documents";
      case "downloads":
        return "ms-settings:privacy-downloadsfolder";
      default:
        return "ms-settings:privacy";
    }
  }
  if (os === "darwin") {
    switch (category) {
      case "microphone":
        return "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";
      case "camera":
        return "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera";
      case "screen-capture":
        return "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";
      case "accessibility":
        return "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";
      case "notifications":
        return "x-apple.systempreferences:com.apple.preference.notifications";
      default:
        return "x-apple.systempreferences:com.apple.preference.security";
    }
  }
  return undefined;
}

function getSettingsLabel(category: PermissionCategory, os: OperatingSystem): string | undefined {
  if (os === "win32") {
    return "Open Windows Settings";
  }
  if (os === "darwin") {
    return "Open System Settings";
  }
  return "Open System Settings";
}

function generateFixGuide(category: PermissionCategory, os: OperatingSystem): string[] {
  const baseSteps: Record<PermissionCategory, string[]> = {
    microphone: [
      "Open system privacy settings.",
      "Navigate to Microphone permissions.",
      "Ensure VEYRA is allowed in the application list.",
      "Return to VEYRA and press 'Refresh' or 'Allow access'.",
    ],
    camera: [
      "Open system privacy settings.",
      "Navigate to Camera permissions.",
      "Ensure VEYRA is allowed in the application list.",
      "Return to VEYRA and press 'Refresh'.",
    ],
    "screen-capture": [
      "Open system privacy settings.",
      "Navigate to Screen Recording / Screen Capture permissions.",
      "Ensure VEYRA is allowed in the application list.",
      "Return to VEYRA and press 'Refresh'.",
    ],
    notifications: [
      "Open system notification settings.",
      "Ensure VEYRA is allowed to send notifications.",
      "Return to VEYRA and test notifications.",
    ],
    accessibility: [
      "Open system accessibility settings.",
      "Ensure VEYRA is allowed to control your computer.",
      "Return to VEYRA and press 'Refresh'.",
    ],
    documents: [
      "Open system file access settings.",
      "Ensure VEYRA has access to your documents folder.",
      "Return to VEYRA and try importing a document.",
    ],
    downloads: [
      "Open system download folder access settings.",
      "Ensure VEYRA has access to your downloads folder.",
      "Return to VEYRA and try downloading a model.",
    ],
  };

  const steps = baseSteps[category] || [
    "Open system privacy settings.",
    `Navigate to ${category} permissions.`,
    "Ensure VEYRA is allowed in the application list.",
    "Return to VEYRA and press 'Refresh'.",
  ];

  if (os === "darwin") {
    return steps.map((step) => step.replace("Open system privacy settings.", "Open System Settings > Privacy & Security."));
  }
  if (os === "linux") {
    return steps.map((step) =>
      step
        .replace("Open system privacy settings.", "Open your desktop environment's privacy/permission settings.")
        .replace("Navigate to", "Use your desktop environment's settings to navigate to")
        .replace("Ensure VEYRA is allowed in the application list.", "Ensure VEYRA has the necessary permissions (may require Flatpak permissions, AppArmor, or portal configuration).")
    );
  }
  return steps;
}

function getSettingsUrlForOS(os: OperatingSystem): string | undefined {
  if (os === "win32") return "ms-settings:privacy";
  if (os === "darwin") return "x-apple.systempreferences:com.apple.preference.security";
  return undefined;
}

export function usePlatformPermissions() {
  const [os] = useState<OperatingSystem>(() => getCurrentOS());
  const [permissions, setPermissions] = useState<Record<PermissionCategory, PermissionState>>(
    () => {
      const initial: Record<PermissionCategory, PermissionState> = {} as Record<PermissionCategory, PermissionState>;
      for (const cat of PERMISSION_CATEGORIES) {
        initial[cat] = "unknown";
      }
      return initial;
    }
  );
  const [platformDetails, setPlatformDetails] = useState<{
    os: OperatingSystem;
    osVersion: string;
    screenCaptureSupported: boolean;
    accessibilitySupported: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fixGuides, setFixGuides] = useState<Record<PermissionCategory, string[]>>(
    () => {
      const initial: Record<PermissionCategory, string[]> = {} as Record<PermissionCategory, string[]>;
      for (const cat of PERMISSION_CATEGORIES) {
        initial[cat] = generateFixGuide(cat, os);
      }
      return initial;
    }
  );
  const [showGuides, setShowGuides] = useState<Record<PermissionCategory, boolean>>(
    () => {
      const initial: Record<PermissionCategory, boolean> = {} as Record<PermissionCategory, boolean>;
      for (const cat of PERMISSION_CATEGORIES) {
        initial[cat] = false;
      }
      return initial;
    }
  );

  useEffect(() => {
    const guides: Record<PermissionCategory, string[]> = {} as Record<PermissionCategory, string[]>;
    for (const cat of PERMISSION_CATEGORIES) {
      guides[cat] = generateFixGuide(cat, os);
    }
    setFixGuides(guides);
  }, [os]);

  const refreshAllPermissions = useCallback(async () => {
    setBusy(true);
    setError("");

    try {
      // Check microphone permission
      if (window.veyra?.audio?.permissionStatus) {
        const result = await window.veyra.audio.permissionStatus();
        const micData = result.data;
        if (result.success && micData) {
          setPermissions((prev) => ({
            ...prev,
            microphone: micData.permission.microphone,
          }));
        }
      }

      // Get platform details
      if (window.veyra?.app?.getPlatformDetails) {
        const result = await window.veyra.app.getPlatformDetails();
        const platformData = result.data;
        if (result.success && platformData) {
          setPlatformDetails({
            os: platformData.os as OperatingSystem,
            osVersion: platformData.osVersion,
            screenCaptureSupported: platformData.screenCaptureSupported,
            accessibilitySupported: platformData.accessibilitySupported,
          });
        }
      }

      // Check notifications permission
      if (window.veyra?.app?.getNotificationPermission) {
        const result = await window.veyra.app.getNotificationPermission();
        if (result) {
          setPermissions((prev) => ({
            ...prev,
            notifications: result.granted ? "granted" : "denied",
          }));
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not check permissions.");
    } finally {
      setBusy(false);
    }
  }, [os]);

  const requestPermission = useCallback(async (category: PermissionCategory) => {
    setBusy(true);
    setError("");

    try {
      if (category === "microphone" && window.veyra?.audio?.requestPermission) {
        const result = await window.veyra.audio.requestPermission();
        const micData = result.data;
        if (result.success && micData) {
          setPermissions((prev) => ({
            ...prev,
            microphone: micData.permission.microphone,
          }));
        }
      } else if (category === "notifications" && window.veyra?.app?.requestNotificationPermission) {
        const result = await window.veyra.app.requestNotificationPermission() as { success: boolean; data?: { state: PermissionState } };
        const notifData = result.data;
        if (result.success && notifData) {
          setPermissions((prev) => ({
            ...prev,
            notifications: notifData.state,
          }));
        }
      } else {
        throw new Error(`Permission request for ${category} not implemented on this platform.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not request ${category} permission.`);
    } finally {
      setBusy(false);
    }
  }, []);

  const openSystemSettings = useCallback((category: PermissionCategory) => {
    const url = getSettingsUrl(category, os);
    if (url) {
      try {
        window.open(url, "_blank");
      } catch {
        // Ignore
      }
    }
  }, [os]);

  const toggleGuide = useCallback((category: PermissionCategory) => {
    setShowGuides((prev) => ({ ...prev, [category]: !prev[category] }));
  }, []);

  const getGuide = useCallback((category: PermissionCategory) => {
    return fixGuides[category] || generateFixGuide(category, os);
  }, [fixGuides, os]);

  const getSettingsUrlForCategory = useCallback((category: PermissionCategory) => {
    return getSettingsUrl(category, os);
  }, [os]);

  const getSettingsLabelForCategory = useCallback((category: PermissionCategory) => {
    return getSettingsLabel(category, os);
  }, [os]);

  const isSupported = useCallback((category: PermissionCategory) => {
    if (category === "accessibility" && os !== "darwin") return false;
    return true;
  }, [os]);

  return {
    os,
    permissions,
    platformDetails,
    busy,
    error,
    showGuides,
    fixGuides,
    refreshAllPermissions,
    requestPermission,
    openSystemSettings,
    toggleGuide,
    getGuide,
    getSettingsUrlForCategory,
    getSettingsLabelForCategory,
    isSupported,
  };
}