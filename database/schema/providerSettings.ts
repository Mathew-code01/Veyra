// ============================================================================
// FILE: database/schema/providerSettings.ts
//
// PURPOSE:
// Canonical Drizzle schema for per-profile provider settings.
//
// Stores the user's BYOK preferences: the AI execution mode
// (local-only / cloud-only / hybrid) and the preferred cloud model per
// provider. No secrets are stored here.
// ============================================================================

import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, updatedAt } from "./_shared";
import { profiles } from "./profiles";

export type AiExecutionMode = "local-only" | "cloud-only" | "hybrid";

export interface ProviderSettingRow {
  readonly id: string;
  readonly profileId: string;
  readonly providerId: string;
  readonly preferredModel?: string | null;
  readonly executionMode: AiExecutionMode;
  readonly updatedAt: string;
}

export const providerSettings = sqliteTable(
  "provider_settings",
  {
    id: idColumn(),

    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),

    providerId: text("provider_id").notNull(),

    preferredModel: text("preferred_model"),

    executionMode: text("execution_mode")
      .notNull()
      .default("local-only"),

    updatedAt: updatedAt(),
  },
  (table) => [
    index("provider_settings_profile_idx").on(table.profileId),
    uniqueIndex("provider_settings_profile_provider_unique").on(
      table.profileId,
      table.providerId,
    ),
  ],
);
