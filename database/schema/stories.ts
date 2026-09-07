import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, jsonText, updatedAt } from "./_shared";
import { profiles } from "./profiles";

export interface StarStory {
  situation?: string;
  task?: string;
  action?: string;
  result?: string;
  metrics?: string[];
}

export const stories = sqliteTable(
  "stories",
  {
    id: idColumn(),
    profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    competency: text("competency"),
    story: jsonText<StarStory>("story").notNull().default({}),
    keywords: text("keywords", { mode: "json" }).$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("stories_profile_idx").on(table.profileId),
    index("stories_competency_idx").on(table.competency),
  ],
);
