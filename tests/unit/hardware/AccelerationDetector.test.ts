import { describe, expect, it } from "vitest";

import { detectOperatingSystem } from "../../../core/hardware/AccelerationDetector";

describe("AccelerationDetector", () => {
  it("detects a supported operating-system value", () => {
    const operatingSystem = detectOperatingSystem();

    expect(["windows", "macos", "linux", "freebsd", "unknown"]).toContain(
      operatingSystem,
    );
  });
});
