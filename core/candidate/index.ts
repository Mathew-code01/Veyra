// ============================================================================
// FILE: core/candidate/index.ts
// PURPOSE:
// Public API for the Candidate domain.
//
// Consumers outside core/candidate should import Candidate functionality
// through this barrel whenever possible.
// ============================================================================

// ----------------------------------------------------------------------------
// Contracts
// ----------------------------------------------------------------------------

export * from "./contracts/CandidateTypes";
export * from "./contracts/CandidateEvidence";
export * from "./contracts/CandidateContext";
export * from "./contracts/CandidateEvidenceRetrieval";

// ----------------------------------------------------------------------------
// Errors
// ----------------------------------------------------------------------------

export * from "./errors/CandidateError";

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------

export * from "./validation/CandidateValidator";

// ----------------------------------------------------------------------------
// Stores
// ----------------------------------------------------------------------------

export * from "./stores/CandidateProfileStore";
export * from "./stores/ExperienceStore";
export * from "./stores/ProjectStore";
export * from "./stores/SkillStore";
export * from "./stores/StoryStore";

// ----------------------------------------------------------------------------
// Services
// ----------------------------------------------------------------------------

export * from "./services/CandidateContextBuilder";
export * from "./services/CandidateEvidenceRetriever";
