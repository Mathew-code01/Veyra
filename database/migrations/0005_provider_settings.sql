PRAGMA foreign_keys = ON;

-- ============================================================================
-- PROVIDER SETTINGS (BYOK preferences)
--
-- Per-profile provider settings: preferred cloud model and AI execution mode
-- (local-only / cloud-only / hybrid). No secrets are stored here.
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_settings (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  preferred_model TEXT,
  execution_mode TEXT NOT NULL DEFAULT 'local-only',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS provider_settings_profile_idx ON provider_settings(profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS provider_settings_profile_provider_unique_idx ON provider_settings(profile_id, provider_id);
