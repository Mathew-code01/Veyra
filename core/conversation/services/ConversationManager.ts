import type {
  ConversationAnalysis,
  ConversationMemorySnapshot,
  ConversationTurn,
  TranscriptSegment,
} from "../../../shared/types/conversation";

import { ConversationAnalyzer } from "./ConversationAnalyzer";
import { ConversationMemory } from "../state/ConversationMemory";
import { ConversationError } from "../errors/ConversationError";

export interface ConversationManagerOptions {
  readonly memory?: ConversationMemory;
  readonly analyzer?: ConversationAnalyzer;
}

export class ConversationManager {
  private readonly analyzer: ConversationAnalyzer;
  private readonly memory: ConversationMemory;

  constructor(options: ConversationManagerOptions = {}) {
    this.analyzer = options.analyzer ?? new ConversationAnalyzer();

    this.memory = options.memory ?? new ConversationMemory();
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

    const previousQuestion = this.memory.getLastQuestion();

    const snapshot = this.memory.snapshot();

    const analysis = this.analyzer.analyze({
      segment,
      previousQuestion,
      previousTopic: snapshot.activeTopic,
      previousQuestions: snapshot.questionHistory,
      signal,
    });

    const finalAnalysis: ConversationAnalysis = {
      ...analysis,
      recentTurns: [...this.memory.getRecentTurns(9), analysis.turn],
    };

    this.memory.addTurn(finalAnalysis.turn);

    return finalAnalysis;
  }

  snapshot(): ConversationMemorySnapshot {
    return this.memory.snapshot();
  }

  clear(): void {
    this.memory.clear();
  }
}
