import { describe, expect, it } from "vitest";

import {
  bytesToGB,
  clampPercentage,
  createMemoryProfile,
} from "../../../core/hardware/HardwareProfile";

describe("HardwareProfile utilities", () => {
  it("converts bytes to GB", () => {
    expect(bytesToGB(1024 ** 3)).toBe(1);
  });

  it("clamps percentages below zero", () => {
    expect(clampPercentage(-20)).toBe(0);
  });

  it("clamps percentages above one hundred", () => {
    expect(clampPercentage(150)).toBe(100);
  });

  it("creates a normalized memory profile", () => {
    const profile = createMemoryProfile(16 * 1024 ** 3, 6 * 1024 ** 3);

    expect(profile.totalGB).toBe(16);
    expect(profile.availableGB).toBe(6);
    expect(profile.usedGB).toBe(10);
  });

  it("does not allow available memory above total memory", () => {
    const profile = createMemoryProfile(8 * 1024 ** 3, 12 * 1024 ** 3);

    expect(profile.availableGB).toBe(8);

    expect(profile.usedGB).toBe(0);
  });
});
