import { describe, expect, it } from "vitest";

import {
  TranscriptionAdapter,
  createMockTranscriptionAdapter,
  createRealCloudWhisperAdapter,
  createRealLocalWhisperAdapter,
  TranscriptionProviderType,
} from "../../../core/audio/TranscriptionAdapter";
import type { TranscriptionRequest } from "../../../core/audio/TranscriptionEngine";

describe("TranscriptionAdapter (mock vs real provider boundary)", () => {
  const audio = new Uint8Array([1, 2, 3, 4]);

  const baseRequest: TranscriptionRequest = {
    audio,
    language: "en",
  };

  it("mock adapter is not a real provider and requires no consent", async () => {
    const adapter = createMockTranscriptionAdapter("Hello world from mock.");
    expect(adapter.isMock()).toBe(true);
    expect(adapter.isReal()).toBe(false);
    expect(adapter.requireConsent()).toBe(false);
    expect(adapter.providerType).toBe("mock");
    expect(adapter.name).toBe("mock-transcription");
  });

  it("mock transcription is deterministic and performs no real call", async () => {
    const adapter = createMockTranscriptionAdapter("Alpha beta gamma delta.");
    const result = await adapter.transcribe(baseRequest, false);
    expect(result.provider).toBe("mock-transcription");
    expect(result.model).toBe("mock-model");
    expect(typeof result.text).toBe("string");
    expect(result.text.length).toBeGreaterThan(0);
    // Same input => same output (deterministic).
    const again = await adapter.transcribe(baseRequest, false);
    expect(again.text).toBe(result.text);
  });

  it("mock streaming emits a final partial", async () => {
    const adapter = createMockTranscriptionAdapter("Streamed transcript.");
    let partialCount = 0;
    let lastIsFinal = false;
    const result = await adapter.transcribeStream(
      baseRequest,
      (partial) => {
        partialCount += 1;
        lastIsFinal = partial.isFinal;
      },
      false,
    );
    expect(typeof result.text).toBe("string");
    expect(result.text.length).toBeGreaterThan(0);
    expect(partialCount).toBeGreaterThan(0);
    expect(lastIsFinal).toBe(true);
  });

  it("real cloud whisper adapter requires consent and denies without it", async () => {
    const adapter = createRealCloudWhisperAdapter({ endpoint: "https://example.com/transcribe" });
    expect(adapter.isReal()).toBe(true);
    expect(adapter.isMock()).toBe(false);
    expect(adapter.requireConsent()).toBe(true);
    expect(adapter.providerType).toBe("real");

    await expect(adapter.transcribe(baseRequest, false)).rejects.toThrow(/consent/);
    await expect(adapter.transcribeStream(baseRequest, () => {}, false)).rejects.toThrow(
      /consent/,
    );
  });

  it("real local whisper adapter is real but does not require external consent", async () => {
    const adapter = createRealLocalWhisperAdapter({
      modelManager: {} as any,
      modelId: "tiny",
    });
    expect(adapter.isReal()).toBe(true);
    expect(adapter.isMock()).toBe(false);
    expect(adapter.requireConsent()).toBe(false);
    expect(adapter.providerType).toBe("real");
  });

  it("adapter surfaces provider name and type clearly", () => {
    const mock = createMockTranscriptionAdapter();
    const real = createRealCloudWhisperAdapter({ endpoint: "https://example.com/x" });
    expect(mock.name).toBe("mock-transcription");
    expect(real.name).toBe("whisper-cloud");
  });
});
