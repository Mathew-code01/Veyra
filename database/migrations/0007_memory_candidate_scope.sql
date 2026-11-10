ALTER TABLE memories ADD COLUMN candidate_id TEXT;

CREATE INDEX IF NOT EXISTS memories_profile_candidate_idx
  ON memories(profile_id, candidate_id, status, updated_at);
