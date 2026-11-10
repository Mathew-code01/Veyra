import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCandidateProfile } from "../../../core/candidate/contracts/CandidateTypes";
import { CandidateRepository } from "../../../database/repositories/candidateRepository";
import {
  createTestDatabase,
  destroyTestDatabase,
  getTestDatabase,
} from "../../helpers/database";

const candidateId = "8f0b2f3e-4678-4bdb-97f6-06e1e4482b01";

describe("CandidateRepository", () => {
  let databasePath: string;
  let activeProfileId: string | undefined;
  let repository: CandidateRepository;

  beforeEach(async () => {
    databasePath = await createTestDatabase();
    activeProfileId = "profile-one";
    getTestDatabase().sqlite.prepare(
      `INSERT INTO profiles (id, display_name, preferences, created_at, updated_at)
       VALUES ('profile-one', 'One', '{}', 'now', 'now'),
              ('profile-two', 'Two', '{}', 'now', 'now')`,
    ).run();
    repository = new CandidateRepository(() => activeProfileId);
  });

  afterEach(async () => {
    await destroyTestDatabase(databasePath);
  });

  function profile(fullName = "Avery Candidate") {
    return createCandidateProfile({
      id: candidateId,
      fullName,
      education: [{ institution: "Example University", degree: "BA" }],
      certifications: [{ name: "Professional Certificate" }],
    });
  }

  it("persists profiles and all structured candidate records across repository instances", async () => {
    await repository.profileStore.save(profile());
    await repository.experienceStore.save({
      id: "experience-1",
      candidateId,
      company: "Example Co",
      title: "Analyst",
      achievements: ["Improved reporting"],
      technologies: ["SQL"],
    });
    await repository.projectStore.save({
      id: "project-1",
      candidateId,
      name: "Forecasting",
      description: "Built a forecasting process.",
      technologies: ["SQL"],
      responsibilities: ["Analysis"],
      achievements: ["Improved forecast accuracy"],
      challenges: [],
      solutions: [],
      outcomes: ["More reliable planning"],
    });
    await repository.skillStore.save({
      id: "skill-1",
      candidateId,
      name: "Financial analysis",
      level: "advanced",
      evidenceIds: [],
    });
    await repository.storyStore.save({
      id: "story-1",
      candidateId,
      title: "Improved reporting",
      situation: "Reports were delayed.",
      task: "Improve delivery.",
      action: "Automated a review process.",
      result: "Reports were delivered on time.",
      skills: ["Analysis"],
      topics: ["Process improvement"],
      verified: false,
      source: "user-entered",
    });

    const reopened = new CandidateRepository(() => activeProfileId);
    expect(await reopened.profileStore.get(candidateId)).toMatchObject({
      fullName: "Avery Candidate",
      education: [{ institution: "Example University" }],
    });
    expect(await reopened.experienceStore.list(candidateId)).toHaveLength(1);
    expect(await reopened.projectStore.get(candidateId, "project-1")).toMatchObject({
      name: "Forecasting",
    });
    expect(await reopened.skillStore.list(candidateId)).toMatchObject([
      { name: "Financial analysis", level: "advanced" },
    ]);
    expect(await reopened.storyStore.list(candidateId)).toMatchObject([
      { verified: false, source: "user-entered" },
    ]);
  });

  it("isolates matching candidate IDs across active profiles", async () => {
    await repository.profileStore.save(profile("Profile One Candidate"));
    activeProfileId = "profile-two";
    await repository.profileStore.save(profile("Profile Two Candidate"));

    expect(await repository.profileStore.get(candidateId)).toMatchObject({
      fullName: "Profile Two Candidate",
    });
    activeProfileId = "profile-one";
    expect(await repository.profileStore.get(candidateId)).toMatchObject({
      fullName: "Profile One Candidate",
    });
  });

  it("prevents records without an owner and cascades profile deletion", async () => {
    await expect(repository.experienceStore.save({
      id: "experience-1",
      candidateId,
      company: "Example Co",
      title: "Analyst",
      achievements: [],
      technologies: [],
    })).rejects.toThrow(/must exist/);

    await repository.profileStore.save(profile());
    await repository.skillStore.save({
      id: "skill-1",
      candidateId,
      name: "Analysis",
      evidenceIds: [],
    });
    await repository.profileStore.remove(candidateId);
    expect(await repository.skillStore.list(candidateId)).toEqual([]);
  });

  it("fails closed when no trusted profile is active", async () => {
    activeProfileId = undefined;
    await expect(repository.profileStore.get(candidateId)).rejects.toThrow(/active profile/);
  });
});
