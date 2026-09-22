// core/conversation/ConversationMemory.ts

import type {
  ConversationMemorySnapshot,
  ConversationTurn,
  TopicAnalysis,
} from "../../shared/types/conversation";

export interface ConversationMemoryOptions {
  maxTurns?: number;
  maxQuestions?: number;
}

export class ConversationMemory {
  private readonly turns: ConversationTurn[] = [];
  private readonly questions: ConversationTurn[] = [];

  private activeTopic?: TopicAnalysis;

  private readonly maxTurns: number;
  private readonly maxQuestions: number;

  constructor(options: ConversationMemoryOptions = {}) {
    this.maxTurns = options.maxTurns ?? 100;
    this.maxQuestions = options.maxQuestions ?? 50;
  }

  addTurn(turn: ConversationTurn): void {
    this.turns.push(turn);

    if (turn.question?.isQuestion) {
      this.questions.push(turn);
    }

    if (turn.topic) {
      this.activeTopic = turn.topic;
    }

    this.trim();
  }

  setTopic(topic: TopicAnalysis): void {
    this.activeTopic = topic;
  }

  getRecentTurns(count = 10): ConversationTurn[] {
    return this.turns.slice(-count);
  }

  getQuestions(): ConversationTurn[] {
    return [...this.questions];
  }

  getLastQuestion(): ConversationTurn | undefined {
    return this.questions.at(-1);
  }

  snapshot(): ConversationMemorySnapshot {
    return {
      turns: [...this.turns],
      activeTopic: this.activeTopic,
      lastQuestion: this.getLastQuestion(),
      questionHistory: [...this.questions],
      candidateAnswerCount: this.turns.filter(
        (turn) => turn.speaker === "candidate",
      ).length,
      interviewerTurnCount: this.turns.filter(
        (turn) => turn.speaker === "interviewer",
      ).length,
    };
  }

  clear(): void {
    this.turns.length = 0;
    this.questions.length = 0;
    this.activeTopic = undefined;
  }

  private trim(): void {
    if (this.turns.length > this.maxTurns) {
      this.turns.splice(0, this.turns.length - this.maxTurns);
    }

    if (this.questions.length > this.maxQuestions) {
      this.questions.splice(0, this.questions.length - this.maxQuestions);
    }
  }
}