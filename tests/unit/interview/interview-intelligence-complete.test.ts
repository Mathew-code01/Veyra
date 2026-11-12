import { describe, expect, it } from "vitest";
import { ProfessionalDomainClassifier } from "../../../core/interview/classification/ProfessionalDomainClassifier";
import { QuestionUnderstandingEngine } from "../../../core/interview/understanding/QuestionUnderstandingEngine";
import { AnswerPlanningEngine } from "../../../core/interview/planning/AnswerPlanningEngine";
import { AnswerEvaluationEngine } from "../../../core/interview/evaluation/AnswerEvaluationEngine";
import { CommunicationAssistanceEngine } from "../../../core/interview/communication/CommunicationAssistanceEngine";
import { FollowUpIntelligenceEngine } from "../../../core/interview/followup/FollowUpIntelligenceEngine";
import { InterviewIntelligence } from "../../../core/interview/services/InterviewIntelligence";

describe("Phase D: General-Purpose Interview Intelligence Engine", () => {
  const domainClassifier = new ProfessionalDomainClassifier();
  const questionUnderstanding = new QuestionUnderstandingEngine();
  const answerPlanner = new AnswerPlanningEngine();
  const answerEvaluator = new AnswerEvaluationEngine();
  const commsEngine = new CommunicationAssistanceEngine();
  const followUpEngine = new FollowUpIntelligenceEngine();

  describe("D1. Professional Domain Classification", () => {
    it("correctly classifies Software Engineering & IT", () => {
      const q = "How do you design a high-throughput, low-latency microservice architecture with caching and PostgreSQL?";
      const res = domainClassifier.classify(q);
      expect(res.primaryDomain).toBe("software_engineering");
      expect(res.confidence).toBeGreaterThan(0.6);
      expect(res.isMixedDomain).toBe(false);
    });

    it("correctly classifies Finance, Accounting & Economics", () => {
      const q = "Can you explain how changes in working capital impact the cash flow statement and EBITDA in a DCF valuation?";
      const res = domainClassifier.classify(q);
      expect(res.primaryDomain).toBe("finance_and_accounting");
      expect(res.confidence).toBeGreaterThan(0.6);
    });

    it("correctly classifies Healthcare & Clinical roles", () => {
      const q = "How do you prioritize patient triage in an emergency room while complying with HIPAA and bedside care protocols?";
      const res = domainClassifier.classify(q);
      expect(res.primaryDomain).toBe("healthcare_and_clinical");
      expect(res.confidence).toBeGreaterThan(0.6);
    });

    it("correctly classifies Human Resources & Talent Acquisition", () => {
      const q = "How would you handle a severe employee grievance involving disciplinary action and succession planning?";
      const res = domainClassifier.classify(q);
      expect(res.primaryDomain).toBe("human_resources");
      expect(res.confidence).toBeGreaterThan(0.6);
    });

    it("correctly classifies Customer Service & Client Support", () => {
      const q = "How do you de-escalate an angry customer on a support ticket to protect our CSAT and SLA metrics?";
      const res = domainClassifier.classify(q);
      expect(res.primaryDomain).toBe("customer_service");
      expect(res.confidence).toBeGreaterThan(0.6);
    });

    it("detects mixed-domain questions appropriately", () => {
      const q = "How do you build a financial machine learning model to forecast portfolio risk and audit GAAP compliance?";
      const res = domainClassifier.classify(q);
      expect(res.isMixedDomain).toBe(true);
      expect(res.secondaryDomains.length).toBeGreaterThan(0);
    });
  });

  describe("D2. Question Understanding", () => {
    it("extracts core intent, archetype, competencies, and requirements", () => {
      const q = "Tell me about a time you had a serious disagreement with a coworker on a project. How did you resolve it?";
      const understanding = questionUnderstanding.understand(q);

      expect(understanding.archetype).toBe("conflict_resolution");
      expect(understanding.expectedResponseType).toBe("experience_based");
      expect(understanding.requirements.requiresPersonalExperience).toBe(true);
      expect(understanding.requirements.requiresConcreteExamples).toBe(true);
      expect(understanding.assessedCompetencies).toContain("Conflict Management");
      expect(understanding.isAmbiguous).toBe(false);
    });

    it("identifies multi-part questions", () => {
      const q = "What is your greatest technical achievement? And how did you lead the team through unexpected delays?";
      const understanding = questionUnderstanding.understand(q);
      expect(understanding.isMultiPart).toBe(true);
      expect(understanding.parts?.length).toBeGreaterThanOrEqual(2);
    });

    it("identifies ambiguous or under-specified questions", () => {
      const q = "Explain that.";
      const understanding = questionUnderstanding.understand(q);
      expect(understanding.isAmbiguous).toBe(true);
      expect(understanding.clarificationRecommended).toBe(true);
      expect(understanding.suggestedClarification).toBeDefined();
    });
  });

  describe("D3 & D4. Structured Answer Planning & Candidate Grounding", () => {
    it("selects STAR_L for behavioral conflict resolution questions", () => {
      const q = "Describe a time you navigated an ethical dilemma with a stakeholder.";
      const understanding = questionUnderstanding.understand(q);
      const plan = answerPlanner.plan(understanding, "behavioral_and_competency");

      expect(["STAR", "STAR_L", "SDO"]).toContain(plan.framework);
      expect(plan.steps.length).toBeGreaterThanOrEqual(3);
      expect(plan.cautions.length).toBeGreaterThan(0);
    });

    it("selects TET (Technical Explanation -> Example -> Trade-offs) for technical questions", () => {
      const q = "Explain the difference between optimistic and pessimistic concurrency control.";
      const understanding = questionUnderstanding.understand(q);
      const plan = answerPlanner.plan(understanding, "software_engineering");

      expect(plan.framework).toBe("TET");
      expect(plan.steps.map((s) => s.phase)).toEqual([
        "Technical Explanation",
        "Practical Example",
        "Trade-offs & Constraints",
      ]);
    });

    it("selects PREP for motivation questions", () => {
      const q = "Why should we hire you for this leadership position?";
      const understanding = questionUnderstanding.understand(q);
      const plan = answerPlanner.plan(understanding, "leadership_and_management");

      expect(plan.framework).toBe("PREP");
      expect(plan.steps.map((s) => s.phase)).toEqual([
        "Point",
        "Reason",
        "Example",
        "Point (Reiteration)",
      ]);
    });

    it("grounds plan in candidate evidence when available", () => {
      const q = "Tell me about a high-impact project you led.";
      const understanding = questionUnderstanding.understand(q);
      const evidence = [
        {
          id: "ev-1",
          text: "Spearheaded migration of core payments service to Rust, reducing latency by 45% and saving $120k annually.",
          source: "cv.pdf",
          confidence: 0.95,
        },
      ];
      const plan = answerPlanner.plan(understanding, "software_engineering", evidence);
      expect(plan.recommendedEvidenceIds).toContain("ev-1");
      expect(plan.steps[0].keyTalkingPoints[0]).toContain("Rust");
    });
  });

  describe("D6. Answer Quality Evaluation", () => {
    it("evaluates answers across all 11 dimensions with meaningful feedback", () => {
      const q = "Tell me about a time you handled a tight deadline.";
      const understanding = questionUnderstanding.understand(q);
      const answer =
        "At my previous company, we faced an urgent release deadline. My goal was to deliver the authentication module in 2 weeks. I personally organized daily standups, scoped down non-critical features, and implemented automated regression tests. As a result, we shipped on time with zero P0 bugs and reduced deployment time by 30%.";

      const evaluation = answerEvaluator.evaluate({
        answerText: answer,
        questionUnderstanding: understanding,
        domain: "software_engineering",
      });

      expect(evaluation.overallScore).toBeGreaterThanOrEqual(75);
      expect(evaluation.dimensions.relevance.score).toBeGreaterThanOrEqual(70);
      expect(evaluation.dimensions.structure.score).toBeGreaterThanOrEqual(80);
      expect(evaluation.dimensions.evidenceGrounding.score).toBeGreaterThanOrEqual(75);
      expect(evaluation.strengths.length).toBeGreaterThan(0);
      expect(evaluation.suggestedRevision).toBeDefined();
    });

    it("penalizes answers with unprofessional language or missing content", () => {
      const q = "Why did you leave your last job?";
      const understanding = questionUnderstanding.understand(q);
      const badAnswer = "My manager was an idiot and the company was completely stupid crap.";

      const evaluation = answerEvaluator.evaluate({
        answerText: badAnswer,
        questionUnderstanding: understanding,
        domain: "general_employment",
      });

      expect(evaluation.overallScore).toBeLessThan(60);
      expect(evaluation.dimensions.professionalism.score).toBeLessThanOrEqual(50);
    });
  });

  describe("D7. Communication & Grammar Assistance", () => {
    it("detects filler words and grammar anomalies", () => {
      const rawSpeech =
        "Um, basically, me and my team was working on this, like, project, and we could of done more better, you know?";
      const feedback = commsEngine.analyze(rawSpeech);

      expect(feedback.fillerWordsCount).toBeGreaterThan(3);
      expect(feedback.fillerWordsDetected.map((f) => f.word)).toContain("um");
      expect(feedback.fillerWordsDetected.map((f) => f.word)).toContain("like");
      expect(feedback.fillerWordsDetected.map((f) => f.word)).toContain("basically");
      expect(feedback.grammarIssues.length).toBeGreaterThan(0);
      expect(feedback.overallRating).toBe("needs_improvement");
    });

    it("recognizes clear, articulate speech", () => {
      const polished =
        "I led the infrastructure modernization effort by conducting thorough requirements discovery and executing our rollout in phased stages.";
      const feedback = commsEngine.analyze(polished);

      expect(feedback.fillerWordsCount).toBe(0);
      expect(feedback.grammarIssues.length).toBe(0);
      expect(feedback.overallRating).toBe("excellent");
      expect(feedback.toneAssessment).toBe("professional");
    });
  });

  describe("D8. Follow-Up Intelligence", () => {
    it("generates follow-up questions asking for numbers when missing", () => {
      const answer = "We improved customer satisfaction and made the process much faster.";
      const understanding = questionUnderstanding.understand("What was your biggest success?");
      const followUps = followUpEngine.generateFollowUps(answer, understanding, "customer_service");

      expect(followUps.length).toBeGreaterThan(0);
      expect(followUps.some((f) => f.type === "numerical_detail")).toBe(true);
    });

    it("generates technical decision and learning follow-ups", () => {
      const answer =
        "I migrated our event broker from RabbitMQ to Apache Kafka, which handled 50,000 events per second.";
      const understanding = questionUnderstanding.understand("Tell me about an architectural decision.");
      const followUps = followUpEngine.generateFollowUps(answer, understanding, "software_engineering");

      expect(followUps.some((f) => f.type === "decision_deep_dive")).toBe(true);
      expect(followUps.some((f) => f.type === "learning_reflection")).toBe(true);
    });
  });

  describe("InterviewIntelligence Integrated Boundary", () => {
    const intelligence = new InterviewIntelligence();

    it("exposes all interview intelligence capabilities cleanly", () => {
      const domain = intelligence.classifyDomain("Explain how to diagnose pediatric asthma.");
      expect(domain.primaryDomain).toBe("healthcare_and_clinical");

      const understanding = intelligence.understandQuestion("How do you manage a portfolio during high inflation?");
      expect(understanding.assessedCompetencies.length).toBeGreaterThan(0);

      const plan = intelligence.planAnswer(understanding, "finance_and_accounting");
      expect(plan.framework).toBeDefined();

      const evaluation = intelligence.evaluateAnswer({
        answerText: "I diversify assets and hedge using Treasury Inflation-Protected Securities (TIPS) and commodities.",
        questionUnderstanding: understanding,
        domain: "finance_and_accounting",
      });
      expect(evaluation.overallScore).toBeGreaterThanOrEqual(60);

      const comms = intelligence.analyzeCommunication("I analyzed the metrics thoroughly.");
      expect(comms.overallRating).toBe("excellent");

      const followUps = intelligence.generateFollowUps("We adjusted the allocations.", understanding, "finance_and_accounting");
      expect(followUps.length).toBeGreaterThan(0);
    });
  });
});
