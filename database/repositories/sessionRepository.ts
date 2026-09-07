import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../client";
import { sessions } from "../schema";

export class SessionRepository {
  private readonly db = getDatabase().db;

  create(input: Omit<typeof sessions.$inferInsert, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    return this.db.insert(sessions).values({ ...input, id: randomUUID(), createdAt: now, updatedAt: now }).returning().get();
  }

  getById(id: string) {
    return this.db.select().from(sessions).where(eq(sessions.id, id)).get();
  }

  listByProfile(profileId: string, limit = 50) {
    return this.db.select()
      .from(sessions)
      .where(eq(sessions.profileId, profileId))
      .orderBy(desc(sessions.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100))
      .all();
  }

  updateStatus(id: string, status: typeof sessions.$inferInsert.status, endedAt?: string) {
    return this.db.update(sessions)
      .set({
        status,
        endedAt,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(sessions.id, id))
      .returning().get();
  }

  deleteForProfile(id: string, profileId: string) {
    return this.db.delete(sessions).where(and(eq(sessions.id, id), eq(sessions.profileId, profileId))).run();
  }
}
