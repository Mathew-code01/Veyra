PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS candidate_profiles (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS candidate_profiles_updated_idx
  ON candidate_profiles(profile_id, updated_at);

CREATE TABLE IF NOT EXISTS candidate_records (
  profile_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('experience', 'project', 'skill', 'story')),
  record_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, candidate_id, record_type, record_id),
  FOREIGN KEY (profile_id, candidate_id)
    REFERENCES candidate_profiles(profile_id, candidate_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS candidate_records_owner_type_idx
  ON candidate_records(profile_id, candidate_id, record_type, updated_at);
