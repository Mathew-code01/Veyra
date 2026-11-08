PRAGMA foreign_keys = ON;

-- ============================================================================
-- MEMORY TABLE
--
-- Persistent memory records (candidate, conversation, session, preference,
-- knowledge). Every record is scoped to profile_id for profile isolation.
-- ============================================================================

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '{}',
  source_type TEXT NOT NULL,
  source_id TEXT,
  source_name TEXT,
  confidence INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'active',
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  extraction_version TEXT,
  expires_at TEXT,
  last_accessed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS memories_profile_idx ON memories(profile_id);
CREATE INDEX IF NOT EXISTS memories_category_idx ON memories(category);
CREATE INDEX IF NOT EXISTS memories_profile_category_idx ON memories(profile_id, category);
CREATE INDEX IF NOT EXISTS memories_source_idx ON memories(source_type, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS memories_source_unique_idx ON memories(profile_id, category, source_type, source_id);

-- ============================================================================
-- CONTEXT VECTORS (PERSISTENT VECTOR STORAGE)
--
-- Persistent storage for embedding vectors backing generic Context retrieval.
-- Cosine similarity is computed in application code over candidate rows
-- fetched with metadata filters. No external vector extension is required.
-- ============================================================================

CREATE TABLE IF NOT EXISTS context_vectors (
  id TEXT PRIMARY KEY,
  context_id TEXT NOT NULL,
  text TEXT NOT NULL,
  vector TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  source_name TEXT,
  content_type TEXT NOT NULL,
  scope TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  embedding_model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS context_vectors_context_idx ON context_vectors(context_id);
CREATE INDEX IF NOT EXISTS context_vectors_source_idx ON context_vectors(source_type, source_id);
