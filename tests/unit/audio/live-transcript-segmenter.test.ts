import { describe, expect, it } from "vitest";

import type { PartialTranscription, TranscriptionResult } from "../../../core/audio/TranscriptionEngine";
import { LiveTranscriptSegmenter } from "../../../core/audio/LiveTranscriptSegmenter";

const result = (text: string): TranscriptionResult => ({
  text,
  language: "en",
  confidence: 0.9,
  durationMs: 1000,
  words: [],
  provider: "test",
  model: "test-model",
});

const partial = (text: string): PartialTranscription => ({
  text,
  timestamp: 1000,
  isFinal: false,
  confidence: 0.8,
});

describe("LiveTranscriptSegmenter (assembly and segmentation)", () => {
  it("keeps partials out of the finalized queue", () => {
    const seg = new LiveTranscriptSegmenter({ sessionStartedAt: 100_000 });
    seg.addPartial(partial("Hello world"));
    expect(seg.takeFinalEntries()).toHaveLength(0);
    expect(seg.getSnapshot().text).toBe("Hello world");
  });

  it("returns each finalized segment exactly once and stamps absolute timestamps", () => {
    const seg = new LiveTranscriptSegmenter({ sessionStartedAt: 100_000 });
    seg.addFinal(result("First segment."), 1000, 2000);
    const first = seg.takeFinalEntries();
    expect(first).toHaveLength(1);
    expect(first[0].text).toBe("First segment.");
    expect(first[0].startedAt).toBe(101_000);
    expect(first[0].endedAt).toBe(102_000);
    expect(first[0].isFinal).toBe(true);
    // Each finalized entry is returned exactly once.
    expect(seg.takeFinalEntries()).toHaveLength(0);
  });

  it("suppresses duplicate final segments within the window", () => {
    const seg = new LiveTranscriptSegmenter({ duplicateWindowMs: 2_000 });
    seg.addFinal(result("Same words."), 1000, 2000);
    seg.addFinal(result("Same words."), 2000, 3000);
    expect(seg.getEntryCount()).toBe(1);
  });

  it("does not suppress genuinely different segments", () => {
    const seg = new LiveTranscriptSegmenter({ duplicateWindowMs: 2_000 });
    seg.addFinal(result("First."), 1000, 2000);
    seg.addFinal(result("Second."), 2000, 3000);
    expect(seg.getEntryCount()).toBe(2);
  });

  it("bounds memory by dropping oldest entries", () => {
    const seg = new LiveTranscriptSegmenter({ maxEntries: 2 });
    seg.addFinal(result("One."), 1000, 2000);
    seg.addFinal(result("Two."), 2000, 3000);
    seg.addFinal(result("Three."), 3000, 4000);
    expect(seg.getEntryCount()).toBe(2);
    const all = seg.takeFinalEntries();
    expect(all.map((s) => s.text)).toEqual(["Two.", "Three."]);
  });

  it("clears the active partial when a final arrives", () => {
    const seg = new LiveTranscriptSegmenter();
    seg.addPartial(partial("Incomplete thought"));
    expect(seg.getSnapshot().text).toBe("Incomplete thought");
    seg.addFinal(result("Complete sentence."), 1000, 2000);
    expect(seg.getSnapshot().text).toBe("Complete sentence.");
  });
});
