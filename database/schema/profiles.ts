import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, jsonText, updatedAt } from "./_shared";

export interface ProfilePreferences {
  answerStyle?: "concise" | "balanced" | "detailed";
  preferredLanguage?: string;
  timezone?: string;
}

export const profiles = sqliteTable(
  "profiles",
  {
    id: idColumn(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    headline: text("headline"),
    summary: text("summary"),
    location: text("location"),
    phone: text("phone"),
    linkedinUrl: text("linkedin_url"),
    githubUrl: text("github_url"),
    websiteUrl: text("website_url"),
    preferences: jsonText<ProfilePreferences>("preferences").notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("profiles_email_unique").on(table.email),
    index("profiles_updated_at_idx").on(table.updatedAt),
  ],
);
