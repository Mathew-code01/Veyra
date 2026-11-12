import { describe, expect, it } from "vitest";

import type { AudioCapture, AudioChunk } from "../../core/audio/AudioCapture";
import { AudioCaptureLifecycle } from "../../../desktop/audio/AudioCaptureLifecycle";

function makeMockCapture(overrides: Partial<AudioCapture> = {}): AudioCapture {
  let isCapturing = false;
  return {
    get isCapturing(): boolean {
      return isCapturing;
    },
    getFormat: () => ({
      sampleRate: 16_000,
      channels: 1,
      sampleFormat: "pcm_s16le" as const,
      bitDepth: 16,
    }),
    start: async () => {
      isCapturing = true;
    },
    stop: async () => {
      isCapturing = false;
    },
    pause: async () => {},
    resume: async () => {},
    onChunk: () => () => {},
    onError: () => () => {},
    dispose: async () => {
      isCapturing = false;
    },
    ...overrides,
  } as AudioCapture;
}

describe("AudioCaptureLifecycle (injected capture, no real microphone)", () => {
  it("requires granted permission before capture can start", async () => {
    const lifecycle = new AudioCaptureLifecycle({ capture: makeMockCapture() });
    expect(lifecycle.permission).toBe("unknown");
    expect(lifecycle.isCapturing).toBe(false);

    await expect(lifecycle.start()).rejects.toThrow(/permission/);

    lifecycle.grantPermission();
    expect(lifecycle.permission).toBe("granted");
    await lifecycle.start();
    expect(lifecycle.isCapturing).toBe(true);
    expect(lifecycle.state.permission).toBe("granted");
    expect(lifecycle.state.isCapturing).toBe(true);
  });

  it("denied permission blocks start", async () => {
    const lifecycle = new AudioCaptureLifecycle({ capture: makeMockCapture() });
    lifecycle.denyPermission();
    expect(lifecycle.permission).toBe("denied");
    await expect(lifecycle.start()).rejects.toThrow(/permission/);
    expect(lifecycle.isCapturing).toBe(false);
  });

  it("pause and resume toggle paused state", async () => {
    const lifecycle = new AudioCaptureLifecycle({ capture: makeMockCapture() });
    lifecycle.grantPermission();
    await lifecycle.start();
    expect(lifecycle.isPaused).toBe(false);

    await lifecycle.pause();
    expect(lifecycle.isPaused).toBe(true);

    await lifecycle.resume();
    expect(lifecycle.isPaused).toBe(false);

    await lifecycle.stop();
    expect(lifecycle.isCapturing).toBe(false);
    expect(lifecycle.isPaused).toBe(false);
  });

  it("stop and dispose release capture", async () => {
    const lifecycle = new AudioCaptureLifecycle({ capture: makeMockCapture() });
    lifecycle.grantPermission();
    await lifecycle.start();
    expect(lifecycle.isCapturing).toBe(true);

    await lifecycle.dispose();
    expect(lifecycle.isCapturing).toBe(false);
    await expect(lifecycle.start()).rejects.toThrow(/disposed/);
  });

  it("forwards chunk and error listeners to the capture", async () => {
    let receivedChunk: AudioChunk | undefined;
    let receivedError: Error | undefined;
    const capture = makeMockCapture({
      onChunk: (listener) => {
        receivedChunk = { id: "c-1", sequence: 1, timestamp: 0, durationMs: 100, data: new Uint8Array([1]), format: { sampleRate: 16000, channels: 1, sampleFormat: "pcm_s16le" as const } };
        listener(receivedChunk);
        return () => {};
      },
    });
    const lifecycle = new AudioCaptureLifecycle({ capture });
    lifecycle.grantPermission();
    lifecycle.onChunk((chunk) => { receivedChunk = chunk; });
    lifecycle.onError((error) => { receivedError = error; });
    await lifecycle.start();
    expect(receivedChunk).toBeDefined();
  });

  it("state listeners are notified on lifecycle transitions", async () => {
    const lifecycle = new AudioCaptureLifecycle({ capture: makeMockCapture() });
    const states: Array<{ isCapturing: boolean; isPaused: boolean; permission: string }> = [];
    lifecycle.onStateChange((s) => states.push({ isCapturing: s.isCapturing, isPaused: s.isPaused, permission: s.permission }));

    lifecycle.grantPermission();
    await lifecycle.start();
    await lifecycle.pause();

    expect(lifecycle.isPaused).toBe(true);
    expect(lifecycle.state.permission).toBe("granted");
    expect(states.some((s) => s.permission === "granted" && s.isCapturing === true)).toBe(true);
    expect(states.some((s) => s.isPaused === true)).toBe(true);
  });
});
