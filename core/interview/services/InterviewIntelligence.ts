// core/interview/InterviewIntelligence.ts

import type { TranscriptSegment } from "../../shared/types/conversation";

import type {
  AnswerGuidance,
  CandidateContext,
  JobContext,
  InterviewClassification,
} from "../../shared/types/interviews";

import { ConversationManager } from "../conversation/ConversationManager";

import { InterviewClassifier } from "./InterviewClassifier";

import { AnswerBuilder } from "./AnswerBuilder";

export interface InterviewIntelligenceResult {
  analysis: ReturnType<ConversationManager["process"]>;

  classification: InterviewClassification;

  guidance?: AnswerGuidance;
}

export interface InterviewIntelligenceOptions {
  candidateContext?: CandidateContext;

  jobContext?: JobContext;

  generateGuidance?: boolean;
}

export class InterviewIntelligence {
  private readonly conversation = new ConversationManager();

  private readonly classifier = new InterviewClassifier();

  private readonly answerBuilder = new AnswerBuilder();

  process(
    segment: TranscriptSegment,
    options: InterviewIntelligenceOptions = {},
  ): InterviewIntelligenceResult {
    const analysis = this.conversation.process(segment);

    const classification = this.classifier.classify(analysis);

    const shouldGenerate = options.generateGuidance ?? true;

    if (!shouldGenerate || !analysis.question?.isQuestion) {
      return {
        analysis,
        classification,
      };
    }

    const guidance = this.answerBuilder.build({
      classification,
      analysis,
      candidateContext: options.candidateContext,
      jobContext: options.jobContext,
      guidance: {
        type: classification.type,
        headline: "",
        sections: [],
        talkingPoints: [],
        cautions: [],
        confidence: 0,
        sourceQuestion: segment.text,
      },
    });

    return {
      analysis,
      classification,
      guidance,
    };
  }

  getConversationSnapshot() {
    return this.conversation.snapshot();
  }

  reset(): void {
    this.conversation.clear();
  }
}