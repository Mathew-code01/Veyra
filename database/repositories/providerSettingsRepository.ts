// ============================================================================
// FILE: database/repositories/providerSettingsRepository.ts
//
// PURPOSE:
// SQLite-backed provider settings repository.
//
// Stores per-profile execution mode and preferred cloud model. No secrets
// are stored here.
// ============================================================================

import { and, eq } from "drizzle-orm";
import type { AiExecutionMode } from "../schema/providerSettings";
import { getDatabase } from "../client";
import { providerSettings } from "../schema";

export interface ProviderSettingRow {
  readonly id: string;
  readonly profileId: string;
  readonly providerId: string;
  readonly preferredModel: string | null;
  readonly executionMode: AiExecutionMode;
  readonly updatedAt: string;
}

export class ProviderSettingsRepository {
  private readonly db = getDatabase().db;

  public get(
    profileId: string,
    providerId: string,
  ): ProviderSettingRow | undefined {
    if (!profileId || !providerId) {
      return undefined;
    }

    const row: ProviderSettingRow | undefined = this.db
      .select()
      .from(providerSettings)
      .where(
        and(
          eq(providerSettings.profileId, profileId),
          eq(providerSettings.providerId, providerId),
        ),
      )
      .get() as ProviderSettingRow | undefined;

    return row;
  }

  public listByProfile(profileId: string): readonly ProviderSettingRow[] {
    if (!profileId) {
      return Object.freeze([]);
    }

    const rows: ProviderSettingRow[] = this.db
      .select()
      .from(providerSettings)
      .where(eq(providerSettings.profileId, profileId))
      .orderBy(providerSettings.providerId)
      .all() as ProviderSettingRow[];

    return Object.freeze(rows);
  }

  public save(row: {
    readonly id: string;
    readonly profileId: string;
    readonly providerId: string;
    readonly preferredModel: string | null;
    readonly executionMode: AiExecutionMode;
  }): void {
    if (!row.id || !row.profileId || !row.providerId) {
      throw new Error("A setting id, profile id, and provider id are required.");
    }

    const existing = this.get(row.profileId, row.providerId);

    if (existing) {
      this.db
        .update(providerSettings)
        .set({
          preferredModel: row.preferredModel ?? null,
          executionMode: row.executionMode,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(providerSettings.profileId, row.profileId),
            eq(providerSettings.providerId, row.providerId),
          ),
        )
      .run();
    } else {
      this.db
        .insert(providerSettings)
        .values({
          id: row.id,
          profileId: row.profileId,
          providerId: row.providerId,
          preferredModel: row.preferredModel ?? null,
          executionMode: row.executionMode,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      .run();
    }
  }
}
