import { describe, expect, it } from "vitest";

import { HardwareTierSelector } from "../../../core/hardware/HardwareTierSelector";

import type { HardwareProfile } from "../../../core/hardware/HardwareProfile";

function createProfile(overrides: Partial<HardwareProfile>): HardwareProfile {
  return {
    version: 1,

    detectedAt: Date.now(),

    operatingSystem: "windows",
    platform: "win32",
    architecture: "x64",

    cpu: {
      manufacturer: "Test",
      brand: "Test CPU",
      model: "Test CPU",
      physicalCores: 4,
      logicalCores: 8,
      speedGHz: 3.5,
      architecture: "x64",
    },

    memory: {
      totalBytes: 16 * 1024 ** 3,
      availableBytes: 8 * 1024 ** 3,
      usedBytes: 8 * 1024 ** 3,

      totalGB: 16,
      availableGB: 8,
      usedGB: 8,
    },

    gpus: [],

    storage: {
      totalBytes: 512 * 1024 ** 3,
      freeBytes: 256 * 1024 ** 3,
      usedBytes: 256 * 1024 ** 3,
      freeGB: 256,
      diskType: "ssd",
    },

    acceleration: {
      cuda: false,
      vulkan: false,
      directml: false,
      metal: false,
      preferredBackend: "cpu",
      availableBackends: ["cpu"],
    },

    systemLoad: {
      cpuUsagePercent: 20,
      memoryUsagePercent: 50,
      sampledAt: Date.now(),
    },

    runtime: {
      ollama: false,
      llamaCpp: false,
      whisperCpp: false,
    },

    tier: "standard",

    localAIRecommended: true,

    memoryConstrained: false,

    visionOnDemandOnly: false,

    ...overrides,
  };
}

describe("HardwareTierSelector", () => {
  const selector = new HardwareTierSelector();

  it("selects ultra-low for 4 GB systems", () => {
    const profile = createProfile({
      memory: {
        totalBytes: 4 * 1024 ** 3,
        availableBytes: 2 * 1024 ** 3,
        usedBytes: 2 * 1024 ** 3,
        totalGB: 4,
        availableGB: 2,
        usedGB: 2,
      },
    });

    expect(selector.select(profile)).toBe("ultra_low");
  });

  it("selects low for 8 GB systems", () => {
    const profile = createProfile({
      memory: {
        totalBytes: 8 * 1024 ** 3,
        availableBytes: 4 * 1024 ** 3,
        usedBytes: 4 * 1024 ** 3,
        totalGB: 8,
        availableGB: 4,
        usedGB: 4,
      },
    });

    expect(selector.select(profile)).toBe("low");
  });

  it("selects standard for 16 GB systems", () => {
    const profile = createProfile({
      memory: {
        totalBytes: 16 * 1024 ** 3,
        availableBytes: 8 * 1024 ** 3,
        usedBytes: 8 * 1024 ** 3,
        totalGB: 16,
        availableGB: 8,
        usedGB: 8,
      },
    });

    expect(selector.select(profile)).toBe("standard");
  });

  it("selects high for 32 GB systems", () => {
    const profile = createProfile({
      memory: {
        totalBytes: 32 * 1024 ** 3,
        availableBytes: 20 * 1024 ** 3,
        usedBytes: 12 * 1024 ** 3,
        totalGB: 32,
        availableGB: 20,
        usedGB: 12,
      },

      gpus: [
        {
          vendor: "nvidia",
          model: "RTX Test GPU",
          vramBytes: 12 * 1024 ** 3,
          isIntegrated: false,
          capabilities: {
            cuda: true,
            vulkan: true,
            directml: true,
            metal: false,
          },
        },
      ],
    });

    expect(selector.select(profile)).toBe("high");
  });

  it("selects very-high for 64 GB systems", () => {
    const profile = createProfile({
      memory: {
        totalBytes: 64 * 1024 ** 3,
        availableBytes: 40 * 1024 ** 3,
        usedBytes: 24 * 1024 ** 3,
        totalGB: 64,
        availableGB: 40,
        usedGB: 24,
      },
    });

    expect(selector.select(profile)).toBe("very_high");
  });

  it("selects workstation for 128 GB systems", () => {
    const profile = createProfile({
      memory: {
        totalBytes: 128 * 1024 ** 3,
        availableBytes: 90 * 1024 ** 3,
        usedBytes: 38 * 1024 ** 3,
        totalGB: 128,
        availableGB: 90,
        usedGB: 38,
      },
    });

    expect(selector.select(profile)).toBe("workstation");
  });

  it("selects extreme for workstation-class systems", () => {
    const profile = createProfile({
      memory: {
        totalBytes: 256 * 1024 ** 3,
        availableBytes: 200 * 1024 ** 3,
        usedBytes: 56 * 1024 ** 3,
        totalGB: 256,
        availableGB: 200,
        usedGB: 56,
      },

      cpu: {
        manufacturer: "Test",
        brand: "Test Workstation CPU",
        model: "Test Workstation CPU",
        physicalCores: 32,
        logicalCores: 64,
        speedGHz: 4.0,
        architecture: "x64",
      },

      gpus: [
        {
          vendor: "nvidia",
          model: "RTX Workstation",
          vramBytes: 48 * 1024 ** 3,
          isIntegrated: false,
          capabilities: {
            cuda: true,
            vulkan: true,
            directml: true,
            metal: false,
          },
        },
      ],
    });

    expect(selector.select(profile)).toBe("extreme");
  });
});
