// ============================================================================
// FILE: database/repositories/providerCredentialRepository.ts
//
// PURPOSE:
// SQLite-backed storage for provider credentials.
//
// Only ciphertext is stored. The raw secret is encrypted by a CredentialVault
// before being passed here, and decrypted after being read from here. This
// repository itself never sees the raw secret.
//
// Profile-scoped: every lookup is keyed by (profile_id, provider_id).
// ============================================================================

import { and, eq } from "drizzle-orm";
import { getDatabase } from "../client";
import { providerCredentials } from "../schema";

export interface ProviderCredentialRow {
  readonly id: string;
  readonly profileId: string;
  readonly providerId: string;
  readonly encryptedCredential: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class ProviderCredentialRepository {
  private readonly db = getDatabase().db;

  public getByProfileAndProvider(
    profileId: string,
    providerId: string,
  ): ProviderCredentialRow | undefined {
    if (!profileId || !providerId) {
      return undefined;
    }

    const row: ProviderCredentialRow | undefined = this.db
      .select()
      .from(providerCredentials)
      .where(
        and(
          eq(providerCredentials.profileId, profileId),
          eq(providerCredentials.providerId, providerId),
        ),
      )
      .get() as ProviderCredentialRow | undefined;

    return row;
  }

  public listByProfile(profileId: string): readonly ProviderCredentialRow[] {
    if (!profileId) {
      return Object.freeze([]);
    }

    const rows: ProviderCredentialRow[] = this.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.profileId, profileId))
      .orderBy(providerCredentials.providerId)
      .all() as ProviderCredentialRow[];

    return Object.freeze(rows);
  }

  public save(row: {
    readonly id: string;
    readonly profileId: string;
    readonly providerId: string;
    readonly encryptedCredential: string;
  }): void {
    if (!row.id || !row.profileId || !row.providerId) {
      throw new Error("A credential id, profile id, and provider id are required.");
    }

    if (!row.encryptedCredential) {
      throw new Error("An encrypted credential is required.");
    }

    const existing = this.getByProfileAndProvider(row.profileId, row.providerId);

    if (existing) {
      this.db
        .update(providerCredentials)
        .set({
          encryptedCredential: row.encryptedCredential,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(providerCredentials.profileId, row.profileId),
            eq(providerCredentials.providerId, row.providerId),
          ),
        )
      .run();
    } else {
      this.db
        .insert(providerCredentials)
        .values({
          id: row.id,
          profileId: row.profileId,
          providerId: row.providerId,
          encryptedCredential: row.encryptedCredential,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      .run();
    }
  }

  public removeByProfileAndProvider(
    profileId: string,
    providerId: string,
  ): boolean {
    if (!profileId || !providerId) {
      return false;
    }

    const result = this.db
      .delete(providerCredentials)
      .where(
        and(
          eq(providerCredentials.profileId, profileId),
          eq(providerCredentials.providerId, providerId),
        ),
      )
    .run();

    return (result.changes ?? 0) > 0;
  }
}
