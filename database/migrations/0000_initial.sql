PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT,
  headline TEXT,
  summary TEXT,
  location TEXT,
  phone TEXT,
  linkedin_url TEXT,
  github_url TEXT,
  website_url TEXT,
  preferences TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique ON profiles(email);
CREATE INDEX IF NOT EXISTS profiles_updated_at_idx ON profiles(updated_at);

CREATE TABLE IF NOT EXISTS experiences (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  title TEXT NOT NULL,
  employment_type TEXT,
  location TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  is_current INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS experiences_profile_idx ON experiences(profile_id);
CREATE INDEX IF NOT EXISTS experiences_current_idx ON experiences(profile_id, is_current);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  proficiency TEXT,
  years_of_experience TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS skills_profile_name_unique ON skills(profile_id, name);
CREATE INDEX IF NOT EXISTS skills_profile_idx ON skills(profile_id);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  role TEXT,
  start_date TEXT,
  end_date TEXT,
  repository_url TEXT,
  live_url TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS projects_profile_slug_unique ON projects(profile_id, slug);
CREATE INDEX IF NOT EXISTS projects_profile_idx ON projects(profile_id);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  competency TEXT,
  story TEXT NOT NULL DEFAULT '{}',
  keywords TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS stories_profile_idx ON stories(profile_id);
CREATE INDEX IF NOT EXISTS stories_competency_idx ON stories(competency);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website_url TEXT,
  industry TEXT,
  role_target TEXT,
  job_description TEXT,
  research TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS companies_profile_name_unique ON companies(profile_id, name);
CREATE INDEX IF NOT EXISTS companies_profile_idx ON companies(profile_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT,
  mode TEXT NOT NULL DEFAULT 'mixed',
  status TEXT NOT NULL DEFAULT 'draft',
  started_at TEXT,
  ended_at TEXT,
  duration_ms INTEGER,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_profile_idx ON sessions(profile_id);
CREATE INDEX IF NOT EXISTS sessions_status_idx ON sessions(status);
CREATE INDEX IF NOT EXISTS sessions_started_at_idx ON sessions(started_at);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  document_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  extracted_text TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS documents_storage_path_unique ON documents(storage_path);
CREATE INDEX IF NOT EXISTS documents_profile_idx ON documents(profile_id);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents(status);

CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  speaker TEXT NOT NULL DEFAULT 'unknown',
  text TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  is_final INTEGER NOT NULL DEFAULT 1,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS transcripts_session_idx ON transcripts(session_id);
CREATE INDEX IF NOT EXISTS transcripts_session_sequence_idx ON transcripts(session_id, sequence);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  transcript_id TEXT REFERENCES transcripts(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'unknown',
  confidence INTEGER NOT NULL DEFAULT 0,
  is_follow_up INTEGER NOT NULL DEFAULT 0,
  parent_question_id TEXT,
  classification TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS questions_session_idx ON questions(session_id);
CREATE INDEX IF NOT EXISTS questions_type_idx ON questions(type);
CREATE INDEX IF NOT EXISTS questions_parent_idx ON questions(parent_question_id);

CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  provider TEXT,
  model TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  confidence INTEGER NOT NULL DEFAULT 0,
  first_token_ms INTEGER,
  total_latency_ms INTEGER,
  token_count INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS answers_session_idx ON answers(session_id);
CREATE INDEX IF NOT EXISTS answers_question_idx ON answers(question_id);

CREATE TABLE IF NOT EXISTS captures (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  storage_path TEXT,
  checksum TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS captures_session_idx ON captures(session_id);
CREATE INDEX IF NOT EXISTS captures_type_idx ON captures(type);

CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value INTEGER NOT NULL,
  unit TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS metrics_session_idx ON metrics(session_id);
CREATE INDEX IF NOT EXISTS metrics_name_idx ON metrics(name);
CREATE INDEX IF NOT EXISTS metrics_created_at_idx ON metrics(created_at);
