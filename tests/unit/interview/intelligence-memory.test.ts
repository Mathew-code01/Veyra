import { describe, expect, it, vi } from "vitest";
import { InterviewIntelligence } from "../../../core/interview/services/InterviewIntelligence";
import type { InterviewEngine } from "../../../core/interview/services/InterviewEngine";
import type { PromptService } from "../../../core/prompts/services/PromptService";
import type { ConversationAnalysis } from "../../../shared/types/conversation";
import type { InterviewAnalysis } from "../../../shared/types/interviews";

describe("InterviewIntelligence memory integration", () => {
  it("adds candidate-scoped memory with provenance to the existing prompt path", async () => {
    const analysis = {
      classification: {
        type: "behavioral",
        confidence: 0.9,
        alternatives: [],
        signals: ["behavioural question"],
      },
      currentTask: {
        id: "task-1",
        type: "behavioral",
        questionText: "Tell me about a time you improved a process.",
        requiresResponse: true,
        confidence: 0.9,
      },
      conversation: {
        turn: { id: "turn-1", text: "Tell me about a time you improved a process." },
      },
      confidence: 0.9,
      signals: [],
    } as unknown as InterviewAnalysis;
    const engine = {
      execute: vi.fn().mockResolvedValue(analysis),
    } as unknown as InterviewEngine;
    const prompt = {
      buildInterview: vi.fn().mockReturnValue({
        family: "interview",
        kind: "behavioral",
        source: "dynamic",
        sections: [],
        messages: [],
      }),
    } as unknown as PromptService;
    const retrieveMemory = vi.fn().mockResolvedValue([
      {
        id: "memory-verified-1",
        text: "Automated a monthly reporting process and reduced delays.",
        verificationStatus: "verified",
        sourceId: "practice-session-1",
      },
    ]);
    const intelligence = new InterviewIntelligence({
      interviewEngine: engine,
      promptService: prompt,
      resolveProfileId: () => "profile-1",
      retrieveMemory,
    });

    const conversation = {
      turn: {
        id: "turn-1",
        text: "Tell me about a time you improved a process.",
      },
    } as unknown as ConversationAnalysis;
    const result = await intelligence.analyze({
      conversation,
      candidateId: "candidate-1",
    });

    expect(retrieveMemory).toHaveBeenCalledWith(
      "profile-1",
      "candidate-1",
      expect.stringContaining("improved a process"),
      undefined,
    );
    expect(result.context?.memoryIds).toEqual(["memory-verified-1"]);
    expect(result.context?.text).toContain("[verified; source practice-session-1]");
    expect(prompt.buildInterview).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          text: expect.stringContaining("Automated a monthly reporting process"),
          sources: ["memory:memory-verified-1"],
        }),
      }),
    );
  });
});
