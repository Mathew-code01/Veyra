// ============================================================================
// FILE: database/repositories/questionRepository.ts
//
// PURPOSE:
// Persistent SQLite data access for interview session questions.
// ============================================================================

import { asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../client";
import { questions } from "../schema";

export class QuestionRepository {
  private readonly db = getDatabase().db;

  create(input: Omit<typeof questions.$inferInsert, "id" | "createdAt">) {
    const now = new Date().toISOString();
    return this.db
      .insert(questions)
      .values({
        ...input,
        id: randomUUID(),
        createdAt: now,
      })
      .returning()
      .get();
  }

  getById(id: string): typeof questions.$inferSelect | undefined {
    return this.db.select().from(questions).where(eq(questions.id, id)).get();
  }

  listBySession(sessionId: string): typeof questions.$inferSelect[] {
    return this.db
      .select()
      .from(questions)
      .where(eq(questions.sessionId, sessionId))
      .orderBy(asc(questions.createdAt))
      .all();
  }

  delete(id: string) {
    return this.db.delete(questions).where(eq(questions.id, id)).run();
  }
}
