import { afterEach, describe, expect, it, vi } from "vitest";

import { CandidateContextBuilder } from "../../../core/candidate/services/CandidateContextBuilder";
import { CandidateService } from "../../../core/candidate/services/CandidateService";
import { createCandidateProfile } from "../../../core/candidate/contracts/CandidateTypes";
import { InterviewIntelligence } from "../../../core/interview/services/InterviewIntelligence";
import type { InterviewEngine } from "../../../core/interview/services/InterviewEngine";
import type { PromptService } from "../../../core/prompts/services/PromptService";
import { CandidateRepository } from "../../../database/repositories/candidateRepository";
import { CandidateEvidenceRepository } from "../../../database/repositories/candidateEvidenceRepository";
import type { ConversationAnalysis } from "../../../shared/types/conversation";
import type { InterviewAnalysis } from "../../../shared/types/interviews";
import {
  createTestDatabase,
  destroyTestDatabase,
  getTestDatabase,
} from "../../helpers/database";

const candidateId = "8f0b2f3e-4678-4bdb-97f6-06e1e4482b01";

describe("candidate context interview integration", () => {
  let databasePath: string | undefined;

  afterEach(async () => {
    if (databasePath) {
      await destroyTestDatabase(databasePath);
      databasePath = undefined;
    }
  });

  it("adds persisted candidate facts and evidence to interview prompt context", async () => {
    databasePath = await createTestDatabase();
    getTestDatabase().sqlite.prepare(
      `INSERT INTO profiles (id, display_name, preferences, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("profile-one", "One", "{}", "2026-01-01", "2026-01-01");

    const repository = new CandidateRepository(() => "profile-one");
    const profile = createCandidateProfile({
      id: candidateId,
      fullName: "Avery Candidate",
      summary: "Experienced operations analyst.",
      education: [],
      certifications: [],
    });
    await repository.profileStore.save(profile);
    await repository.experienceStore.save({
      id: "experience-one",
      candidateId,
      company: "Example Co",
      title: "Operations Analyst",
      achievements: ["Automated monthly reporting"],
      technologies: ["SQL"],
    });

    const evidenceStore = new CandidateEvidenceRepository(() => "profile-one");
    await evidenceStore.save({
      id: "evidence-resume-one",
      candidateId,
      type: "resume",
      text: "Reduced manual reporting time by 30 percent.",
      sourceId: "document-one",
      sourceName: "resume.txt",
      verified: false,
      confidence: 0.8,
      metadata: { sourceType: "document" },
    });
    const contextBuilder = new CandidateContextBuilder({
      profileStore: repository.profileStore,
      experienceStore: repository.experienceStore,
      projectStore: repository.projectStore,
      skillStore: repository.skillStore,
      storyStore: repository.storyStore,
      evidenceStore,
    });
    const candidateService = new CandidateService({
      profileStore: repository.profileStore,
      contextBuilder,
    });

    const analysis = {
      classification: {
        type: "behavioral",
        confidence: 0.9,
        alternatives: [],
        signals: ["behavioural question"],
      },
      currentTask: {
        id: "task-one",
        type: "behavioral",
        questionText: "Tell me about a time you improved a process.",
        requiresResponse: true,
        confidence: 0.9,
      },
      conversation: {
        turn: { id: "turn-one", text: "Tell me about a time you improved a process." },
      },
      confidence: 0.9,
      signals: [],
    } as unknown as InterviewAnalysis;
    const interviewEngine = {
      execute: vi.fn().mockResolvedValue(analysis),
    } as unknown as InterviewEngine;
    const promptService = {
      buildInterview: vi.fn().mockReturnValue({
        family: "interview",
        kind: "behavioral",
        source: "dynamic",
        sections: [],
        messages: [],
      }),
    } as unknown as PromptService;
    const intelligence = new InterviewIntelligence({
      interviewEngine,
      promptService,
      candidateService,
      retrieveCandidateContext: async (id, signal) => {
        const context = await candidateService.getContext({ candidateId: id, signal });
        return {
          text: context.text,
          evidenceIds: context.evidence.map((item) => item.id),
        };
      },
    });

    const conversation = {
      turn: {
        id: "turn-one",
        text: "Tell me about a time you improved a process.",
      },
    } as unknown as ConversationAnalysis;
    const result = await intelligence.analyze({ conversation, candidateId });

    expect(result.context?.text).toContain("Automated monthly reporting");
    expect(result.context?.text).toContain("Reduced manual reporting time by 30 percent.");
    expect(result.context?.candidateEvidenceIds).toContain("evidence-resume-one");
    expect(promptService.buildInterview).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          text: expect.stringContaining("Automated monthly reporting"),
          sources: expect.arrayContaining(["candidate:evidence-resume-one"]),
        }),
      }),
    );
  });
});
