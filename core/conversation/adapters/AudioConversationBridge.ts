// core/conversation/adapters/AudioConversationBridge.ts

import type { AudioTranscriptSegment } from "../../../shared/types/audio";

import type { ConversationAnalysis } from "../../../shared/types/conversation";

import { ConversationManager } from "../services/ConversationManager";

import {
  AudioTranscriptMapper,
  type AudioTranscriptMapperOptions,
} from "./AudioTranscriptMapper";

export interface AudioConversationBridgeOptions extends AudioTranscriptMapperOptions {
  readonly manager?: ConversationManager;
}

/**
 * Connects the audio transcript boundary to conversation analysis.
 *
 * Architectural direction:
 *
 *     audio → conversation
 *
 * Conversation never imports AudioCapture, Whisper, AudioBuffer,
 * or TranscriptionEngine.
 */
export class AudioConversationBridge {
  private readonly manager: ConversationManager;

  private readonly mapper: AudioTranscriptMapper;

  constructor(options: AudioConversationBridgeOptions = {}) {
    this.manager = options.manager ?? new ConversationManager();

    this.mapper = new AudioTranscriptMapper(options);
  }

  /**
   * Processes a finalized audio transcript segment.
   *
   * Partial transcript events are deliberately ignored by
   * conversation memory.
   *
   * This prevents:
   *
   * "I"
   * "I am"
   * "I am a"
   * "I am a software"
   * "I am a software developer"
   *
   * from becoming five separate conversation turns.
   */
  process(
    segment: AudioTranscriptSegment,
    signal?: AbortSignal,
  ): ConversationAnalysis | undefined {
    if (!segment.isFinal) {
      return undefined;
    }

    const transcript = this.mapper.map(segment);

    return this.manager.process(transcript, signal);
  }

  snapshot(sessionId: string) {
    return this.manager.snapshot(sessionId);
  }

  clear(sessionId: string): void {
    this.manager.clear(sessionId);
  }

  getManager(): ConversationManager {
    return this.manager;
  }
}