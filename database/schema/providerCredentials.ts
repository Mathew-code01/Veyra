// ============================================================================
// FILE: database/schema/providerCredentials.ts
//
// PURPOSE:
// Canonical Drizzle schema for provider credentials.
//
// ONLY ciphertext (produced by OS-backed secure storage) is stored here.
// The raw API key / secret is never written to SQLite in plaintext.
//
// Each credential is scoped to profile_id and provider_id so a user's
// BYOK credentials cannot leak between profiles.
// ============================================================================

import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, updatedAt } from "./_shared";
import { profiles } from "./profiles";

export interface StoredProviderCredential {
  readonly id: string;
  readonly profileId: string;
  readonly providerId: string;
  /**
   * Ciphertext produced by `CredentialVault.encrypt`. Never the raw secret.
   */
  readonly encryptedCredential: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const providerCredentials = sqliteTable(
  "provider_credentials",
  {
    id: idColumn(),

    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),

    providerId: text("provider_id").notNull(),

    encryptedCredential: text("encrypted_credential").notNull(),

    createdAt: createdAt(),

    updatedAt: updatedAt(),
  },
  (table) => [
    index("provider_credentials_profile_idx").on(table.profileId),
    index("provider_credentials_provider_idx").on(table.providerId),
    uniqueIndex("provider_credentials_profile_provider_unique").on(
      table.profileId,
      table.providerId,
    ),
  ],
);
