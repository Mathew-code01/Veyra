import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, updatedAt } from "./_shared";
import { profiles } from "./profiles";

export const skills = sqliteTable(
  "skills",
  {
    id: idColumn(),
    profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category"),
    proficiency: text("proficiency"),
    yearsOfExperience: text("years_of_experience"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("skills_profile_name_unique").on(table.profileId, table.name),
    index("skills_profile_idx").on(table.profileId),
  ],
);
