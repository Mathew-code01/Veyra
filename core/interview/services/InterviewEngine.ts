// core/interview/InterviewEngine.ts

import { BehavioralEngine } from "./BehavioralEngine";

import { TechnicalEngine } from "./TechnicalEngine";

import { CodingEngine } from "./CodingEngine";

import { SystemDesignEngine } from "./SystemDesignEngine";

import { ProductEngine } from "./ProductEngine";

import { CaseEngine } from "./CaseEngine";

import { CommunicationEngine } from "./CommunicationEngine";

import { InterviewClassifier, type InterviewMode } from "./InterviewClassifier";

import type { QuestionType } from "../conversation/QuestionClassifier";

export interface InterviewAnalysisInput {
  question: string;
  questionType?: QuestionType;
  candidateContext?: string;
}

export class InterviewEngine {
  readonly classifier = new InterviewClassifier();

  readonly behavioral = new BehavioralEngine();

  readonly technical = new TechnicalEngine();

  readonly coding = new CodingEngine();

  readonly systemDesign = new SystemDesignEngine();

  readonly product = new ProductEngine();

  readonly case = new CaseEngine();

  readonly communication = new CommunicationEngine();

  analyze(input: InterviewAnalysisInput) {
    const questionType = input.questionType ?? "general";

    const classification = this.classifier.classify(questionType);

    return {
      classification,
      result: this.runEngine(
        classification.mode,
        input.question,
        input.candidateContext,
      ),
    };
  }

  private runEngine(
    mode: InterviewMode,
    question: string,
    candidateContext?: string,
  ) {
    switch (mode) {
      case "behavioral":
        return this.behavioral.analyze({
          question,
          candidateContext,
        });

      case "technical":
        return this.technical.analyze({
          question,
          candidateContext,
        });

      case "coding":
        return this.coding.analyze({
          problem: question,
        });

      case "system-design":
        return this.systemDesign.analyze({
          question,
        });

      case "product":
        return this.product.analyze({
          question,
        });

      case "case":
        return this.case.analyze({
          caseQuestion: question,
        });

      case "communication":
        return this.communication.analyze({
          question,
        });

      default:
        return {
          mode,
          prompt: [
            "Answer the interview question directly.",
            "",
            question,
            "",
            candidateContext ? `Candidate context:\n${candidateContext}` : "",
          ].join("\n"),
        };
    }
  }
}