import type {
  ConversationAnalysis,
  ConversationTurn,
  TranscriptSegment,
} from "../../../shared/types/conversation";

import { ConversationError } from "../errors/ConversationError";
import { ConversationTextNormalizer } from "../normalization/ConversationTextNormalizer";
import { ConversationValidator } from "../validation/ConversationValidator";

import { QuestionDetector } from "../detectors/QuestionDetector";
import { FollowUpDetector } from "../detectors/FollowUpDetector";
import { ClarificationDetector } from "../detectors/ClarificationDetector";
import { RepetitionDetector } from "../detectors/RepetitionDetector";

import { QuestionClassifier } from "../classification/QuestionClassifier";
import { IntentClassifier } from "../classification/IntentClassifier";

import { TopicTracker } from "../tracking/TopicTracker";

import type {
  ConversationAnalyzerContract,
  ConversationAnalyzerInput,
} from "../contracts/ConversationAnalyzer";

export class ConversationAnalyzer implements ConversationAnalyzerContract {
  private readonly validator = new ConversationValidator();

  private readonly normalizer = new ConversationTextNormalizer();

  private readonly questionDetector = new QuestionDetector();

  private readonly questionClassifier = new QuestionClassifier();

  private readonly followUpDetector = new FollowUpDetector();

  private readonly clarificationDetector = new ClarificationDetector();

  private readonly repetitionDetector = new RepetitionDetector();

  private readonly topicTracker = new TopicTracker();

  private readonly intentClassifier = new IntentClassifier();

  analyze(input: ConversationAnalyzerInput): ConversationAnalysis {
    this.assertNotCancelled(input.signal);

    try {
      this.validator.validateSegment(input.segment);

      const normalizedText = this.normalizer.normalize(input.segment.text);

      const normalizedSegment: TranscriptSegment = {
        ...input.segment,
        text: normalizedText,
      };

      const turn = this.createTurn(normalizedSegment);

      this.assertNotCancelled(input.signal);

      const detectedQuestion = this.questionDetector.detect(normalizedText);

      const question = this.questionClassifier.classify(detectedQuestion);

      this.assertNotCancelled(input.signal);

      const topic = this.topicTracker.track(turn, input.previousTopic);

      const preliminaryClarification =
        this.clarificationDetector.detect(normalizedText);

      const preliminaryIntent = this.intentClassifier.classify({
        text: normalizedText,
        isQuestion: question.isQuestion,
        isFollowUp: false,
        isClarification: preliminaryClarification.isClarification,
        speaker: turn.speaker,
      });

      const preliminaryTurn: ConversationTurn = {
        ...turn,
        question,
        topic,
        intent: preliminaryIntent.intent,
        confidence: preliminaryIntent.confidence,
      };

      const followUp = this.followUpDetector.detect(
        preliminaryTurn,
        input.previousQuestion,
      );

      const clarification = this.clarificationDetector.detect(normalizedText);

      const intent = this.intentClassifier.classify({
        text: normalizedText,
        isQuestion: question.isQuestion,
        isFollowUp: followUp.isFollowUp,
        isClarification: clarification.isClarification,
        speaker: turn.speaker,
      });

      const finalTurn: ConversationTurn = {
        ...preliminaryTurn,
        intent: intent.intent,
        confidence: intent.confidence,
      };

      const repetition = this.repetitionDetector.detect(finalTurn, [
        ...input.previousQuestions,
      ]);

      return {
        turn: finalTurn,
        question,
        followUp,
        repetition,
        clarification,
        topic,
        intent,
        recentTurns: [],
      };
    } catch (error) {
      if (error instanceof ConversationError) {
        throw error;
      }

      throw ConversationError.analysisFailed(
        "Failed to analyze conversation segment.",
        {
          sessionId: input.segment.sessionId,
          segmentId: input.segment.id,
          cause: error,
        },
      );
    }
  }

  private createTurn(segment: TranscriptSegment): ConversationTurn {
    return {
      id: `turn_${segment.id}`,
      segmentId: segment.id,
      speaker: segment.speaker,
      text: segment.text,
      timestamp: segment.createdAt,
      intent: "unknown",
      confidence: 0,
    };
  }

  private assertNotCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw ConversationError.cancelled();
    }
  }
}
