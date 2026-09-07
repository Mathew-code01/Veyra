import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, jsonText, updatedAt } from "./_shared";
import { profiles } from "./profiles";

export interface ExperienceMetadata {
  technologies?: string[];
  achievements?: string[];
}

export const experiences = sqliteTable(
  "experiences",
  {
    id: idColumn(),
    profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    companyName: text("company_name").notNull(),
    title: text("title").notNull(),
    employmentType: text("employment_type"),
    location: text("location"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(false),
    description: text("description"),
    metadata: jsonText<ExperienceMetadata>("metadata").notNull().default({}),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("experiences_profile_idx").on(table.profileId),
    index("experiences_current_idx").on(table.profileId, table.isCurrent),
  ],
);
