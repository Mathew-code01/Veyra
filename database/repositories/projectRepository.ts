import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../client";
import { projects } from "../schema";

export class ProjectRepository {
  private readonly db = getDatabase().db;

  create(input: Omit<typeof projects.$inferInsert, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    return this.db.insert(projects).values({ ...input, id: randomUUID(), createdAt: now, updatedAt: now }).returning().get();
  }

  getById(id: string) {
    return this.db.select().from(projects).where(eq(projects.id, id)).get();
  }

  listByProfile(profileId: string) {
    return this.db.select().from(projects).where(eq(projects.profileId, profileId)).all();
  }

  update(id: string, input: Partial<Omit<typeof projects.$inferInsert, "id" | "createdAt">>) {
    return this.db.update(projects).set({ ...input, updatedAt: new Date().toISOString() }).where(eq(projects.id, id)).returning().get();
  }

  deleteForProfile(id: string, profileId: string) {
    return this.db.delete(projects).where(and(eq(projects.id, id), eq(projects.profileId, profileId))).run();
  }
}
