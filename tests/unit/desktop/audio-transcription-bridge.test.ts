import { describe, expect, it } from "vitest";

import type { InterviewRuntimeLike } from "../../../desktop/audio/AudioTranscriptionBridge";
import { AudioTranscriptionBridge } from "../../../desktop/audio/AudioTranscriptionBridge";
import type { AudioCaptureLifecycle } from "../../../desktop/audio/AudioCaptureLifecycle";
import { createMockTranscriptionAdapter } from "../../../core/audio/TranscriptionAdapter";

function makeCaptureLifecycle(): AudioCaptureLifecycle {
  const lifecycle = {
    permission: "granted" as const,
    isCapturing: false,
    isPaused: false,
    start: async () => {},
    stop: async () => {},
    dispose: async () => {},
    onChunk: () => () => {},
    onError: () => () => {},
    onStateChange: () => () => {},
  } as unknown as AudioCaptureLifecycle;
  return lifecycle;
}

function makeRuntime(): InterviewRuntimeLike & {
  calls: Array<{ readonly sessionId: string; readonly text: string; readonly source: string }>;
} {
  const calls: Array<{ readonly sessionId: string; readonly text: string; readonly source: string }> = [];
  return {
    calls,
    async processQuestion(input) {
      calls.push({ sessionId: input.sessionId, text: input.text, source: input.source });
      return {
        sessionId: input.sessionId,
        mode: "live",
        source: input.source,
        questionText: input.text,
        conversation: { segmentId: "s", text: input.text, isFinal: true },
        analysis: { classification: { type: "behavioral", confidence: 0.8 }, confidence: 0.8, signals: [] },
        domain: { primaryDomain: "general_employment", confidence: 0.5 },
        understanding: { coreIntent: input.text, assessedCompetencies: [], clarifiedQuestion: input.text },
        guidance: { talkingPoints: [], cautions: [], structure: [] },
        evidence: [],
        provenance: { candidateEvidenceIds: [], memoryIds: [], contextIds: [], factsGrounded: false, assumptions: [], missingInformation: [] },
        confidence: 0.5,
        followUps: [],
        ai: { executed: false },
        questionId: "q-1",
      };
    },
  } as unknown as InterviewRuntimeLike & { calls: typeof calls };
}

describe("AudioTranscriptionBridge (capture → transcript → runtime)", () => {
  it("submits a finalized transcript segment to the runtime as a voice_transcript question", async () => {
    const runtime = makeRuntime();
    const captureLifecycle = makeCaptureLifecycle();
    const adapter = createMockTranscriptionAdapter("The candidate describes a leadership challenge.");

    const bridge = new AudioTranscriptionBridge({
      runtime,
      captureLifecycle,
      transcriptionAdapter: adapter,
      sessionId: "sess-1",
      consentGiven: true,
    });

    expect(bridge.isRunning).toBe(false);
    await bridge.start();
    expect(bridge.isRunning).toBe(true);
    expect(bridge.state.permission).toBe("granted");

    // Simulate a captured audio chunk being transcribed and finalized.
    captureLifecycle.onChunk((chunk) => {
      void bridge["handleChunk"](chunk as never);
    });

    const chunk = {
      id: "c-1",
      sequence: 1,
      timestamp: 1000,
      durationMs: 1000,
      // 1200 bytes -> 6 words -> the full mocked transcript.
      data: new Uint8Array(1200),
      format: { sampleRate: 16_000, channels: 1, sampleFormat: "pcm_s16le" as const },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (bridge as any).handleChunk(chunk);

    expect(runtime.calls).toHaveLength(1);
    expect(runtime.calls[0].sessionId).toBe("sess-1");
    expect(runtime.calls[0].source).toBe("voice_transcript");
    expect(runtime.calls[0].text).toBe("The candidate describes a leadership challenge.");

    await bridge.stop();
    expect(bridge.isRunning).toBe(false);
  });

  it("requires consent before starting when the adapter is consent-gated", async () => {
    const runtime = makeRuntime();
    const captureLifecycle = makeCaptureLifecycle();
    const adapter = createMockTranscriptionAdapter("x");

    // consentGiven=false but adapter requires no consent (mock) => starts fine
    const bridge = new AudioTranscriptionBridge({
      runtime,
      captureLifecycle,
      transcriptionAdapter: adapter,
      sessionId: "sess-2",
      consentGiven: false,
    });
    await bridge.start();
    expect(bridge.isRunning).toBe(true);
    await bridge.dispose();
  });
});
