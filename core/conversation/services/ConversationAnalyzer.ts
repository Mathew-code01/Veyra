// core/conversation/services/ConversationAnalyzer.ts

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

      if (!normalizedText) {
        throw new Error("Conversation segment contains no analyzable text.");
      }

      const normalizedSegment: TranscriptSegment = {
        ...input.segment,
        text: normalizedText,
      };

      const turn = this.createTurn(normalizedSegment);

      this.assertNotCancelled(input.signal);

      // --------------------------------------------------------------
      // QUESTION
      // --------------------------------------------------------------

      const detectedQuestion = this.questionDetector.detect(normalizedText);

      const question = this.questionClassifier.classify(detectedQuestion);

      this.assertNotCancelled(input.signal);

      // --------------------------------------------------------------
      // TOPIC
      // --------------------------------------------------------------

      const topic = this.topicTracker.track(turn, input.previousTopic);

      // --------------------------------------------------------------
      // CLARIFICATION
      // --------------------------------------------------------------

      const clarification = this.clarificationDetector.detect(normalizedText);

      // --------------------------------------------------------------
      // RESPONSE RELATIONSHIP
      // --------------------------------------------------------------

      const isResponseToQuestion = this.isResponseToPreviousQuestion(
        turn,
        input.previousQuestion,
      );

      // --------------------------------------------------------------
      // PRELIMINARY INTENT
      // --------------------------------------------------------------

      const preliminaryIntent = this.intentClassifier.classify({
        text: normalizedText,
        isQuestion: question.isQuestion,
        isFollowUp: false,
        isClarification: clarification.isClarification,
        isResponseToQuestion,
      });

      const preliminaryTurn: ConversationTurn = {
        ...turn,
        question,
        topic,
        intent: preliminaryIntent.intent,
        confidence: preliminaryIntent.confidence,
      };

      // --------------------------------------------------------------
      // FOLLOW-UP
      // --------------------------------------------------------------

      const followUp = this.followUpDetector.detect(
        preliminaryTurn,
        input.previousQuestion,
      );

      this.assertNotCancelled(input.signal);

      // --------------------------------------------------------------
      // FINAL INTENT
      // --------------------------------------------------------------

      const intent = this.intentClassifier.classify({
        text: normalizedText,
        isQuestion: question.isQuestion,
        isFollowUp: followUp.isFollowUp,
        isClarification: clarification.isClarification,
        isResponseToQuestion,
      });

      const finalTurn: ConversationTurn = {
        ...preliminaryTurn,
        intent: intent.intent,
        confidence: intent.confidence,
      };

      // --------------------------------------------------------------
      // REPETITION
      // --------------------------------------------------------------

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
      id: segment.id,
      segmentId: segment.id,
      speaker: segment.speaker,
      speakerId: segment.speakerId,
      text: segment.text,
      timestamp: segment.createdAt,
      intent: "unknown",
      confidence: 0,
    };
  }

  private isResponseToPreviousQuestion(
    currentTurn: ConversationTurn,
    previousQuestion?: ConversationTurn,
  ): boolean {
    if (!previousQuestion) {
      return false;
    }

    /*
     * Speaker identity is the strongest signal.
     *
     * Example:
     *
     * speaker-1 asks a question
     * speaker-2 responds
     *
     * This can be interpreted as a response without assuming
     * speaker-1 is an interviewer or speaker-2 is a candidate.
     */
    if (currentTurn.speakerId && previousQuestion.speakerId) {
      return currentTurn.speakerId !== previousQuestion.speakerId;
    }

    /*
     * Fall back to generic semantic roles when available.
     *
     * Do not infer "answer" when both sides are simply
     * generic participants and no speaker identity exists.
     */
    if (
      currentTurn.speaker !== "participant" &&
      previousQuestion.speaker !== "participant"
    ) {
      return currentTurn.speaker !== previousQuestion.speaker;
    }

    return false;
  }

  private assertNotCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw ConversationError.cancelled();
    }
  }
}
