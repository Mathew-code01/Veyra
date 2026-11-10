PRAGMA foreign_keys = ON;

-- ============================================================================
-- PROVIDER CREDENTIALS (BYOK)
--
-- Stores ONLY ciphertext produced by OS-backed secure storage (Electron
-- safeStorage). The raw API key / secret is never written to SQLite in
-- plaintext.
--
-- Each credential is scoped to profile_id and provider_id.
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_credentials (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  encrypted_credential TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS provider_credentials_profile_idx ON provider_credentials(profile_id);
CREATE INDEX IF NOT EXISTS provider_credentials_provider_idx ON provider_credentials(provider_id);
CREATE UNIQUE INDEX IF NOT EXISTS provider_credentials_profile_provider_unique_idx ON provider_credentials(profile_id, provider_id);
