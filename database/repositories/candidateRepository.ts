import type {
  CandidateExperience,
  CandidateProfile,
  CandidateProject,
  CandidateSkill,
  CandidateStory,
} from "../../core/candidate/contracts/CandidateTypes";
import { CandidateError } from "../../core/candidate/errors/CandidateError";
import { CandidateValidator } from "../../core/candidate/validation/CandidateValidator";
import type { CandidateProfileStore } from "../../core/candidate/stores/CandidateProfileStore";
import type { ExperienceStore } from "../../core/candidate/stores/ExperienceStore";
import type { ProjectStore } from "../../core/candidate/stores/ProjectStore";
import type { SkillStore } from "../../core/candidate/stores/SkillStore";
import type { StoryStore } from "../../core/candidate/stores/StoryStore";
import { getDatabase } from "../client";

type CandidateRecordType = "experience" | "project" | "skill" | "story";
type CandidateRecord =
  | CandidateExperience
  | CandidateProject
  | CandidateSkill
  | CandidateStory;

interface StoredCandidateRecord {
  readonly record_id: string;
  readonly payload: string;
}

export class CandidateRepository {
  public readonly profileStore: CandidateProfileStore;
  public readonly experienceStore: ExperienceStore;
  public readonly projectStore: ProjectStore;
  public readonly skillStore: SkillStore;
  public readonly storyStore: StoryStore;

  private readonly sqlite = getDatabase().sqlite;
  private readonly validator: CandidateValidator;
  private readonly resolveProfileId: () => string | undefined;

  public constructor(
    resolveProfileId: () => string | undefined,
    validator: CandidateValidator = new CandidateValidator(),
  ) {
    this.resolveProfileId = resolveProfileId;
    this.validator = validator;
    this.profileStore = {
      get: (id) => this.getProfile(id),
      save: (profile) => this.saveProfile(profile),
      remove: (id) => this.removeProfile(id),
    };
    this.experienceStore = {
      list: (id) => this.listRecords(id, "experience"),
      get: (candidateId, id) => this.getRecord(candidateId, "experience", id),
      save: (record) => this.saveExperience(record),
      remove: (candidateId, id) => this.removeRecord(candidateId, "experience", id),
    };
    this.projectStore = {
      list: (id) => this.listRecords(id, "project"),
      get: (candidateId, id) => this.getRecord(candidateId, "project", id),
      save: (record) => this.saveProject(record),
      remove: (candidateId, id) => this.removeRecord(candidateId, "project", id),
    };
    this.skillStore = {
      list: (id) => this.listRecords(id, "skill"),
      get: (candidateId, id) => this.getRecord(candidateId, "skill", id),
      save: (record) => this.saveSkill(record),
      remove: (candidateId, id) => this.removeRecord(candidateId, "skill", id),
    };
    this.storyStore = {
      list: (id) => this.listRecords(id, "story"),
      get: (candidateId, id) => this.getRecord(candidateId, "story", id),
      save: (record) => this.saveStory(record),
      remove: (candidateId, id) => this.removeRecord(candidateId, "story", id),
    };
  }

  public async listProfiles(): Promise<readonly CandidateProfile[]> {
    const rows = this.sqlite.prepare(
      `SELECT payload FROM candidate_profiles
       WHERE profile_id = ?
       ORDER BY updated_at DESC, candidate_id`,
    ).all(this.requireProfileId()) as Array<{ payload: string }>;
    return Object.freeze(rows.map((row) => this.parse<CandidateProfile>(row.payload, "candidate profile")));
  }

  private async getProfile(candidateId: string): Promise<CandidateProfile | undefined> {
    this.validator.validateCandidateId(candidateId);
    const row = this.sqlite.prepare(
      `SELECT payload FROM candidate_profiles
       WHERE profile_id = ? AND candidate_id = ?`,
    ).get(this.requireProfileId(), candidateId.trim()) as
      | { payload: string }
      | undefined;
    return row ? this.parse<CandidateProfile>(row.payload, "candidate profile") : undefined;
  }

  private async saveProfile(profile: CandidateProfile): Promise<void> {
    this.validator.validateProfile(profile);
    const profileId = this.requireProfileId();
    const candidateId = profile.id.trim();
    const now = new Date().toISOString();
    const payload = JSON.stringify({ ...profile, id: candidateId, updatedAt: now });
    const existing = this.sqlite.prepare(
      `SELECT created_at FROM candidate_profiles
       WHERE profile_id = ? AND candidate_id = ?`,
    ).get(profileId, candidateId) as { created_at: string } | undefined;

    this.sqlite.prepare(
      `INSERT INTO candidate_profiles
         (profile_id, candidate_id, full_name, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(profile_id, candidate_id) DO UPDATE SET
         full_name = excluded.full_name,
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
    ).run(
      profileId,
      candidateId,
      profile.fullName.trim(),
      payload,
      existing?.created_at ?? profile.createdAt,
      now,
    );
  }

  private async removeProfile(candidateId: string): Promise<void> {
    this.validator.validateCandidateId(candidateId);
    const profileId = this.requireProfileId();
    const normalizedCandidateId = candidateId.trim();
    this.sqlite.transaction(() => {
      this.sqlite.prepare(
        `DELETE FROM candidate_evidence WHERE profile_id = ? AND candidate_id = ?`,
      ).run(profileId, normalizedCandidateId);
      this.sqlite.prepare(
        `DELETE FROM memories WHERE profile_id = ? AND candidate_id = ?`,
      ).run(profileId, normalizedCandidateId);
      this.sqlite.prepare(
        `DELETE FROM context_vectors
         WHERE CASE WHEN json_valid(scope) THEN json_extract(scope, '$.profileId') END = ?
           AND CASE WHEN json_valid(scope) THEN json_extract(scope, '$.candidateId') END = ?`,
      ).run(profileId, normalizedCandidateId);
      this.sqlite.prepare(
        `DELETE FROM candidate_profiles WHERE profile_id = ? AND candidate_id = ?`,
      ).run(profileId, normalizedCandidateId);
    })();
  }

  private async listRecords<T extends CandidateRecord>(
    candidateId: string,
    type: CandidateRecordType,
  ): Promise<readonly T[]> {
    this.validator.validateCandidateId(candidateId);
    const rows = this.sqlite.prepare(
      `SELECT payload FROM candidate_records
       WHERE profile_id = ? AND candidate_id = ? AND record_type = ?
       ORDER BY created_at, record_id`,
    ).all(this.requireProfileId(), candidateId.trim(), type) as Array<{ payload: string }>;
    return Object.freeze(rows.map((row) => this.parse<T>(row.payload, type)));
  }

  private async getRecord<T extends CandidateRecord>(
    candidateId: string,
    type: CandidateRecordType,
    recordId: string,
  ): Promise<T | undefined> {
    this.validator.validateCandidateId(candidateId);
    const row = this.sqlite.prepare(
      `SELECT payload FROM candidate_records
       WHERE profile_id = ? AND candidate_id = ? AND record_type = ? AND record_id = ?`,
    ).get(this.requireProfileId(), candidateId.trim(), type, recordId.trim()) as
      | { payload: string }
      | undefined;
    return row ? this.parse<T>(row.payload, type) : undefined;
  }

  private async saveExperience(record: CandidateExperience): Promise<void> {
    this.validator.validateExperience(record);
    this.persistRecord("experience", record);
  }

  private async saveProject(record: CandidateProject): Promise<void> {
    this.validator.validateProject(record);
    this.persistRecord("project", record);
  }

  private async saveSkill(record: CandidateSkill): Promise<void> {
    this.validator.validateSkill(record);
    this.persistRecord("skill", record);
  }

  private async saveStory(record: CandidateStory): Promise<void> {
    this.validator.validateStory(record);
    this.persistRecord("story", record);
  }

  private persistRecord(type: CandidateRecordType, record: CandidateRecord): void {
    const profileId = this.requireProfileId();
    const candidateId = record.candidateId.trim();
    const recordId = record.id.trim();
    this.requireCandidate(profileId, candidateId);
    const now = new Date().toISOString();
    const existing = this.sqlite.prepare(
      `SELECT created_at FROM candidate_records
       WHERE profile_id = ? AND candidate_id = ? AND record_type = ? AND record_id = ?`,
    ).get(profileId, candidateId, type, recordId) as { created_at: string } | undefined;

    this.sqlite.prepare(
      `INSERT INTO candidate_records
         (profile_id, candidate_id, record_type, record_id, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(profile_id, candidate_id, record_type, record_id) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
    ).run(profileId, candidateId, type, recordId, JSON.stringify(record), existing?.created_at ?? now, now);
  }

  private async removeRecord(
    candidateId: string,
    type: CandidateRecordType,
    recordId: string,
  ): Promise<void> {
    this.validator.validateCandidateId(candidateId);
    const id = recordId.trim();
    if (!id) {
      throw CandidateError.invalidRequest("Record id is required.", {
        candidateId: candidateId.trim(),
      });
    }

    this.sqlite.prepare(
      `DELETE FROM candidate_records
       WHERE profile_id = ? AND candidate_id = ? AND record_type = ? AND record_id = ?`,
    ).run(this.requireProfileId(), candidateId.trim(), type, id);
  }

  private requireProfileId(): string {
    const profileId = this.resolveProfileId()?.trim();
    if (!profileId) throw new Error("An active profile is required for candidate records.");
    return profileId;
  }

  private requireCandidate(profileId: string, candidateId: string): void {
    const row = this.sqlite.prepare(
      `SELECT 1 FROM candidate_profiles WHERE profile_id = ? AND candidate_id = ?`,
    ).get(profileId, candidateId);
    if (!row) {
      throw CandidateError.notFound("Candidate profile must exist before saving candidate records.", {
        stage: "profile",
        candidateId,
      });
    }
  }

  private parse<T>(payload: string, label: string): T {
    try {
      return JSON.parse(payload) as T;
    } catch (error) {
      throw new Error(`Stored ${label} is invalid JSON.`, { cause: error });
    }
  }
}
