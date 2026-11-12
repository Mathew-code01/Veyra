// ============================================================================
// FILE: database/repositories/answerRepository.ts
//
// PURPOSE:
// Persistent SQLite data access for candidate answers and evaluation results.
// ============================================================================

import { asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../client";
import { answers } from "../schema";

export class AnswerRepository {
  private readonly db = getDatabase().db;

  create(input: Omit<typeof answers.$inferInsert, "id" | "createdAt">) {
    const now = new Date().toISOString();
    return this.db
      .insert(answers)
      .values({
        ...input,
        id: randomUUID(),
        createdAt: now,
      })
      .returning()
      .get();
  }

  getById(id: string): typeof answers.$inferSelect | undefined {
    return this.db.select().from(answers).where(eq(answers.id, id)).get();
  }

  getByQuestionId(questionId: string): typeof answers.$inferSelect | undefined {
    return this.db.select().from(answers).where(eq(answers.questionId, questionId)).get();
  }

  listBySession(sessionId: string): typeof answers.$inferSelect[] {
    return this.db
      .select()
      .from(answers)
      .where(eq(answers.sessionId, sessionId))
      .orderBy(asc(answers.createdAt))
      .all();
  }

  delete(id: string) {
    return this.db.delete(answers).where(eq(answers.id, id)).run();
  }
}
