import type {
  ConversationMemorySnapshot,
  ConversationTurn,
  TopicAnalysis,
} from "../../../shared/types/conversation";

export interface ConversationMemoryOptions {
  readonly maxTurns?: number;
  readonly maxQuestionHistory?: number;
}

export class ConversationMemory {
  private readonly maxTurns: number;
  private readonly maxQuestionHistory: number;

  private turns: ConversationTurn[] = [];
  private questionHistory: ConversationTurn[] = [];
  private activeTopic?: TopicAnalysis;

  constructor(options: ConversationMemoryOptions = {}) {
    this.maxTurns = Math.max(1, options.maxTurns ?? 100);

    this.maxQuestionHistory = Math.max(1, options.maxQuestionHistory ?? 50);
  }

  addTurn(turn: ConversationTurn): void {
    this.turns.push(turn);

    if (turn.question?.isQuestion) {
      this.questionHistory.push(turn);

      if (this.questionHistory.length > this.maxQuestionHistory) {
        this.questionHistory.splice(
          0,
          this.questionHistory.length - this.maxQuestionHistory,
        );
      }
    }

    if (turn.topic) {
      this.activeTopic = turn.topic;
    }

    if (this.turns.length > this.maxTurns) {
      this.turns.splice(0, this.turns.length - this.maxTurns);
    }
  }

  getLastQuestion(): ConversationTurn | undefined {
    return this.questionHistory.at(-1);
  }

  getQuestions(): readonly ConversationTurn[] {
    return [...this.questionHistory];
  }

  getRecentTurns(limit = 10): readonly ConversationTurn[] {
    return this.turns.slice(-Math.max(0, limit));
  }

  snapshot(): ConversationMemorySnapshot {
    const candidateAnswerCount = this.turns.filter(
      (turn) => turn.speaker === "candidate" && turn.intent === "answer",
    ).length;

    const interviewerTurnCount = this.turns.filter(
      (turn) => turn.speaker === "interviewer",
    ).length;

    return {
      turns: [...this.turns],
      activeTopic: this.activeTopic,
      lastQuestion: this.getLastQuestion(),
      questionHistory: [...this.questionHistory],
      candidateAnswerCount,
      interviewerTurnCount,
    };
  }

  clear(): void {
    this.turns = [];
    this.questionHistory = [];
    this.activeTopic = undefined;
  }
}
