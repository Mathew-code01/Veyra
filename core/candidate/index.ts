// ============================================================================
// FILE: core/candidate/index.ts
// PURPOSE:
// Public API for the Candidate domain.
// ============================================================================

export * from "./contracts/CandidateTypes";

export * from "./contracts/CandidateEvidence";

export * from "./contracts/CandidateContext";

export * from "./contracts/CandidateEvidenceRetrieval";

export * from "./contracts/CandidateEvidenceStore";

export * from "./contracts/CandidateDocumentEvidence";

export * from "./errors/CandidateError";

export * from "./validation/CandidateValidator";

export * from "./stores/CandidateProfileStore";

export * from "./stores/ExperienceStore";

export * from "./stores/ProjectStore";

export * from "./stores/SkillStore";

export * from "./stores/StoryStore";

export * from "./services/CandidateContextBuilder";

export * from "./services/CandidateEvidenceRetriever";

export * from "./services/CandidateService";

export * from "./services/CandidateDocumentEvidenceAdapter";
