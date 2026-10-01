import type {
  ConversationAnalysis,
  ConversationMemorySnapshot,
  ConversationTurn,
  TranscriptSegment,
} from "../../../shared/types/conversation";

import type { UUID } from "../../../shared/types/common";

import { ConversationAnalyzer } from "./ConversationAnalyzer";
import { ConversationMemory } from "../state/ConversationMemory";
import { ConversationError } from "../errors/ConversationError";

export interface ConversationManagerOptions {
  readonly analyzer?: ConversationAnalyzer;

  readonly memoryOptions?: {
    readonly maxTurns?: number;
    readonly maxQuestionHistory?: number;
  };
}

/**
 * Coordinates conversation analysis and session-scoped memory.
 *
 * Important:
 * One ConversationManager may safely handle multiple sessions.
 *
 * Memory is isolated by:
 *     TranscriptSegment.sessionId
 */
export class ConversationManager {
  private readonly analyzer: ConversationAnalyzer;

  private readonly memoryOptions: ConversationManagerOptions["memoryOptions"];

  private readonly sessions = new Map<UUID, ConversationMemory>();

  constructor(options: ConversationManagerOptions = {}) {
    this.analyzer = options.analyzer ?? new ConversationAnalyzer();

    this.memoryOptions = options.memoryOptions;
  }

  process(
    segment: TranscriptSegment,
    signal?: AbortSignal,
  ): ConversationAnalysis {
    if (signal?.aborted) {
      throw ConversationError.cancelled({
        sessionId: segment.sessionId,
        segmentId: segment.id,
      });
    }

    const memory = this.getOrCreateMemory(segment.sessionId);

    const previousQuestion = memory.getLastQuestion();

    const snapshot = memory.snapshot();

    const analysis = this.analyzer.analyze({
      segment,
      previousQuestion,
      previousTopic: snapshot.activeTopic,
      previousQuestions: snapshot.questionHistory,
      signal,
    });

    const finalAnalysis: ConversationAnalysis = {
      ...analysis,

      recentTurns: [...memory.getRecentTurns(9), analysis.turn],
    };

    memory.addTurn(finalAnalysis.turn);

    return finalAnalysis;
  }

  snapshot(sessionId: UUID): ConversationMemorySnapshot {
    const memory = this.sessions.get(sessionId);

    if (!memory) {
      return new ConversationMemory(sessionId, this.memoryOptions).snapshot();
    }

    return memory.snapshot();
  }

  clear(sessionId: UUID): void {
    this.sessions.delete(sessionId);
  }

  clearAll(): void {
    this.sessions.clear();
  }

  private getOrCreateMemory(sessionId: UUID): ConversationMemory {
    let memory = this.sessions.get(sessionId);

    if (!memory) {
      memory = new ConversationMemory(sessionId, this.memoryOptions);

      this.sessions.set(sessionId, memory);
    }

    return memory;
  }
}
