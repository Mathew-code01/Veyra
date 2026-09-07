import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, jsonText } from "./_shared";
import { sessions } from "./sessions";

export interface MetricTags {
  provider?: string;
  model?: string;
  stage?: string;
  operation?: string;
}

export const metrics = sqliteTable(
  "metrics",
  {
    id: idColumn(),
    sessionId: text("session_id").references(() => sessions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    value: integer("value").notNull(),
    unit: text("unit").notNull(),
    tags: jsonText<MetricTags>("tags").notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index("metrics_session_idx").on(table.sessionId),
    index("metrics_name_idx").on(table.name),
    index("metrics_created_at_idx").on(table.createdAt),
  ],
);
