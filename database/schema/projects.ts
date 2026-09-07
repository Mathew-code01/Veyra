import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, jsonText, updatedAt } from "./_shared";
import { profiles } from "./profiles";

export interface ProjectMetadata {
  technologies?: string[];
  responsibilities?: string[];
  achievements?: string[];
  links?: string[];
}

export const projects = sqliteTable(
  "projects",
  {
    id: idColumn(),
    profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    role: text("role"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    repositoryUrl: text("repository_url"),
    liveUrl: text("live_url"),
    metadata: jsonText<ProjectMetadata>("metadata").notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("projects_profile_slug_unique").on(table.profileId, table.slug),
    index("projects_profile_idx").on(table.profileId),
  ],
);
