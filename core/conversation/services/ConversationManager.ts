// core/conversation/ConversationManager.ts
import type {
  ConversationAnalysis,
  ConversationTurn,
  TranscriptSegment,
} from "../../shared/types/conversation";

import { QuestionDetector } from "./QuestionDetector";
import { QuestionClassifier } from "./QuestionClassifier";
import { FollowUpDetector } from "./FollowUpDetector";
import { RepetitionDetector } from "./RepetitionDetector";
import { ClarificationDetector } from "./ClarificationDetector";
import { TopicTracker } from "./TopicTracker";
import { IntentClassifier } from "./IntentClassifier";
import { ConversationMemory } from "./ConversationMemory";

export interface ConversationManagerOptions {
  memory?: ConversationMemory;
}

export class ConversationManager {
  private readonly questionDetector = new QuestionDetector();

  private readonly questionClassifier = new QuestionClassifier();

  private readonly followUpDetector = new FollowUpDetector();

  private readonly repetitionDetector = new RepetitionDetector();

  private readonly clarificationDetector = new ClarificationDetector();

  private readonly topicTracker = new TopicTracker();

  private readonly intentClassifier = new IntentClassifier();

  private readonly memory: ConversationMemory;

  constructor(options: ConversationManagerOptions = {}) {
    this.memory = options.memory ?? new ConversationMemory();
  }

  process(segment: TranscriptSegment): ConversationAnalysis {
    const currentTurn = this.createTurn(segment);

    const question = this.questionClassifier.classify(
      this.questionDetector.detect(segment.text),
    );

    currentTurn.question = question;

    const previousQuestion = this.memory.getLastQuestion();

    const previousTopic = this.memory.snapshot().activeTopic;

    const topic = this.topicTracker.track(currentTurn, previousTopic);

    currentTurn.topic = topic;

    const clarification = this.clarificationDetector.detect(segment.text);

    const preliminaryIntent = this.intentClassifier.classify({
      text: segment.text,
      isQuestion: question.isQuestion,
      isFollowUp: false,
      isClarification: clarification.isClarification,
      speaker: segment.speaker,
    });

    currentTurn.intent = preliminaryIntent.intent;

    const followUp = this.followUpDetector.detect(
      currentTurn,
      previousQuestion,
    );

    const intent = this.intentClassifier.classify({
      text: segment.text,
      isQuestion: question.isQuestion,
      isFollowUp: followUp.isFollowUp,
      isClarification: clarification.isClarification,
      speaker: segment.speaker,
    });

    currentTurn.intent = intent.intent;
    currentTurn.confidence = intent.confidence;

    const repetition = this.repetitionDetector.detect(
      currentTurn,
      this.memory.getQuestions(),
    );

    this.memory.addTurn(currentTurn);

    return {
      turn: currentTurn,
      question,
      followUp,
      repetition,
      clarification,
      topic,
      intent,
      recentTurns: this.memory.getRecentTurns(10),
    };
  }

  snapshot() {
    return this.memory.snapshot();
  }

  clear(): void {
    this.memory.clear();
  }

  private createTurn(segment: TranscriptSegment): ConversationTurn {
    return {
      id: `turn_${segment.id}`,
      segmentId: segment.id,
      speaker: segment.speaker,
      text: segment.text.trim(),
      timestamp: segment.createdAt,
      intent: "unknown",
      confidence: 0,
    };
  }
}