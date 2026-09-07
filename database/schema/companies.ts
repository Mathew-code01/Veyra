import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, jsonText, updatedAt } from "./_shared";
import { profiles } from "./profiles";

export interface CompanyResearch {
  overview?: string;
  culture?: string;
  products?: string[];
  competitors?: string[];
  recentNews?: string[];
  interviewNotes?: string[];
}

export const companies = sqliteTable(
  "companies",
  {
    id: idColumn(),
    profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    websiteUrl: text("website_url"),
    industry: text("industry"),
    roleTarget: text("role_target"),
    jobDescription: text("job_description"),
    research: jsonText<CompanyResearch>("research").notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("companies_profile_name_unique").on(table.profileId, table.name),
    index("companies_profile_idx").on(table.profileId),
  ],
);
