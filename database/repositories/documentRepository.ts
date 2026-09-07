import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../client";
import { documents } from "../schema";

export class DocumentRepository {
  private readonly db = getDatabase().db;

  create(input: Omit<typeof documents.$inferInsert, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    return this.db.insert(documents).values({ ...input, id: randomUUID(), createdAt: now, updatedAt: now }).returning().get();
  }

  getById(id: string) {
    return this.db.select().from(documents).where(eq(documents.id, id)).get();
  }

  listByProfile(profileId: string) {
    return this.db.select().from(documents).where(eq(documents.profileId, profileId)).all();
  }

  markReady(id: string, extractedText: string) {
    return this.db.update(documents)
      .set({ status: "ready", extractedText, updatedAt: new Date().toISOString() })
      .where(eq(documents.id, id))
      .returning().get();
  }

  markFailed(id: string) {
    return this.db.update(documents)
      .set({ status: "failed", updatedAt: new Date().toISOString() })
      .where(eq(documents.id, id))
      .returning().get();
  }

  deleteForProfile(id: string, profileId: string) {
    return this.db.delete(documents).where(and(eq(documents.id, id), eq(documents.profileId, profileId))).run();
  }
}
