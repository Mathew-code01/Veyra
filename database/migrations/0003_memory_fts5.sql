PRAGMA foreign_keys = ON;

-- ============================================================================
-- MEMORY FULL-TEXT SEARCH (FTS5)
--
-- Genuine SQLite FTS5 over memory content, kept synchronized with the
-- memories table via triggers. Replaces the previous SQL LIKE keyword search.
-- `id` is UNINDEXED so only the `content` column is searched.
-- ============================================================================

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  id UNINDEXED,
  content
);

-- Backfill any memory records that predate this FTS5 table (upgrades).
INSERT INTO memories_fts(id, content)
  SELECT id, content FROM memories
  WHERE id NOT IN (SELECT id FROM memories_fts);

CREATE TRIGGER IF NOT EXISTS memories_fts_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(id, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS memories_fts_ad AFTER DELETE ON memories BEGIN
  DELETE FROM memories_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS memories_fts_au AFTER UPDATE ON memories BEGIN
  DELETE FROM memories_fts WHERE id = old.id;
  INSERT INTO memories_fts(id, content) VALUES (new.id, new.content);
END;
