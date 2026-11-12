import { describe, expect, it, vi } from "vitest";

import { AnalyticsManager } from "../../../core/analytics/AnalyticsManager";

describe("analytics manager", () => {
  it("sanitizes metadata before dispatching events", async () => {
    const sink = {
      publish: vi.fn(async (events) => {
        expect(events).toHaveLength(1);
        expect(events[0]?.metadata).toMatchObject({
          provider: "openrouter",
          apiKey: "[REDACTED]",
          nested: { token: "[REDACTED]" },
        });
      }),
    };

    const manager = new AnalyticsManager({ sink, maxEvents: 25 });

    manager.recordModelExecution({
      provider: "openrouter",
      model: "gpt-4o-mini",
      durationMs: 250,
      success: true,
      metadata: {
        provider: "openrouter",
        apiKey: "top-secret",
        nested: {
          token: "abc",
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sink.publish).toHaveBeenCalledTimes(1);
  });

  it("keeps the newest events in a bounded ring buffer", () => {
    const manager = new AnalyticsManager({ maxEvents: 2 });

    manager.record({
      type: "custom",
      category: "test",
      severity: "info",
      success: true,
    });
    manager.record({
      type: "custom",
      category: "test",
      severity: "warning",
      success: false,
    });
    manager.record({
      type: "custom",
      category: "test",
      severity: "error",
      success: false,
    });

    expect(manager.list()).toHaveLength(2);
    expect(manager.list()[0]?.severity).toBe("warning");
  });
});
