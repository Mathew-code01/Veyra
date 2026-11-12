import { describe, expect, it } from "vitest";

import { QuestionBoundaryDetector } from "../../../core/interview/live/QuestionBoundaryDetector";

describe("QuestionBoundaryDetector", () => {
  const detector = new QuestionBoundaryDetector();

  it("detects a new interviewer question", () => {
    const result = detector.detect("Tell me about a time you led a team through a crisis.");
    expect(result.isNewQuestion).toBe(true);
    expect(result.isMultiPart).toBe(false);
    expect(result.parts).toHaveLength(1);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("detects a multi-part question", () => {
    const result = detector.detect("What is your greatest strength? And what is your greatest weakness?");
    expect(result.isMultiPart).toBe(true);
    expect(result.parts.length).toBeGreaterThan(1);
  });

  it("detects a follow-up question after a previous question", () => {
    const first = detector.detect("Describe your experience with project management.");
    expect(first.isNewQuestion).toBe(true);

    const followUp = detector.detect("What tools did you use?", "Describe your experience with project management.");
    expect(followUp.isFollowUp).toBe(true);
    expect(followUp.isNewQuestion).toBe(true);
  });

  it("detects a clarification request", () => {
    const result = detector.detect("What do you mean by that?", "Describe your greatest weakness.");
    expect(result.isClarification).toBe(true);
  });

  it("treats a non-question statement as not a new question", () => {
    const result = detector.detect("I worked at Acme Corp for five years as a developer.");
    expect(result.isNewQuestion).toBe(false);
    expect(result.isMultiPart).toBe(false);
  });

  it("returns an empty boundary for empty input", () => {
    const result = detector.detect("");
    expect(result.isNewQuestion).toBe(false);
    expect(result.parts).toHaveLength(0);
    expect(result.confidence).toBe(0);
  });

  it("respects the maximum parts limit", () => {
    const detectorLimited = new QuestionBoundaryDetector({ maxParts: 2 });
    const result = detectorLimited.detect("One? Two? Three? Four?");
    expect(result.parts.length).toBeLessThanOrEqual(2);
  });
});
