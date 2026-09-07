import { eq } from "drizzle-orm";
import { getDatabase } from "../client";
import { profiles } from "../schema";
import { randomUUID } from "node:crypto";

export type NewProfile = typeof profiles.$inferInsert;
export type Profile = typeof profiles.$inferSelect;

export class ProfileRepository {
  private readonly db = getDatabase().db;

  create(input: Omit<NewProfile, "id" | "createdAt" | "updatedAt">): Profile {
    const id = randomUUID();
    const now = new Date().toISOString();
    return this.db.insert(profiles).values({ ...input, id, createdAt: now, updatedAt: now }).returning().get();
  }

  getById(id: string): Profile | undefined {
    return this.db.select().from(profiles).where(eq(profiles.id, id)).get();
  }

  update(id: string, input: Partial<Omit<NewProfile, "id" | "createdAt">>): Profile | undefined {
    return this.db.update(profiles).set({ ...input, updatedAt: new Date().toISOString() }).where(eq(profiles.id, id)).returning().get();
  }

  delete(id: string): void {
    this.db.delete(profiles).where(eq(profiles.id, id)).run();
  }
}
