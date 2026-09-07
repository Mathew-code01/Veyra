import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../client";
import { stories } from "../schema";

export class StoryRepository {
  private readonly db = getDatabase().db;

  create(input: Omit<typeof stories.$inferInsert, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    return this.db.insert(stories).values({ ...input, id: randomUUID(), createdAt: now, updatedAt: now }).returning().get();
  }

  getById(id: string) {
    return this.db.select().from(stories).where(eq(stories.id, id)).get();
  }

  listByProfile(profileId: string) {
    return this.db.select().from(stories).where(eq(stories.profileId, profileId)).orderBy(desc(stories.updatedAt)).all();
  }

  update(id: string, input: Partial<Omit<typeof stories.$inferInsert, "id" | "createdAt">>) {
    return this.db.update(stories).set({ ...input, updatedAt: new Date().toISOString() }).where(eq(stories.id, id)).returning().get();
  }

  deleteForProfile(id: string, profileId: string) {
    return this.db.delete(stories).where(and(eq(stories.id, id), eq(stories.profileId, profileId))).run();
  }
}
