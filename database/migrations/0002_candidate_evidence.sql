PRAGMA foreign_keys = ON;

-- ============================================================================
-- CANDIDATE EVIDENCE
--
-- Persistent candidate evidence records derived from documents, interviews,
-- or other candidate-domain sources. Every record is scoped to profile_id
-- (profile isolation) and candidate_id (evidence ownership).
-- ============================================================================

CREATE TABLE IF NOT EXISTS candidate_evidence (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  source_id TEXT,
  source_name TEXT,
  source_type TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  confidence INTEGER NOT NULL DEFAULT 50,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS candidate_evidence_profile_idx ON candidate_evidence(profile_id);
CREATE INDEX IF NOT EXISTS candidate_evidence_candidate_idx ON candidate_evidence(candidate_id);
CREATE INDEX IF NOT EXISTS candidate_evidence_profile_candidate_idx ON candidate_evidence(profile_id, candidate_id);
CREATE INDEX IF NOT EXISTS candidate_evidence_source_idx ON candidate_evidence(source_type, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS candidate_evidence_source_unique_idx ON candidate_evidence(profile_id, candidate_id, source_type, source_id);
