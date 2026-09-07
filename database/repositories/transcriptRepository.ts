import { asc, eq, max } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../client";
import { transcripts } from "../schema";

export class TranscriptRepository {
  private readonly db = getDatabase().db;

  append(input: Omit<typeof transcripts.$inferInsert, "id" | "createdAt" | "sequence">) {
    const current = this.db.select({ maxSequence: max(transcripts.sequence) })
      .from(transcripts)
      .where(eq(transcripts.sessionId, input.sessionId))
      .get();

    const sequence = (current?.maxSequence ?? -1) + 1;
    return this.db.insert(transcripts).values({
      ...input,
      id: randomUUID(),
      sequence,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  listBySession(sessionId: string) {
    return this.db.select()
      .from(transcripts)
      .where(eq(transcripts.sessionId, sessionId))
      .orderBy(asc(transcripts.sequence))
      .all();
  }

  getById(id: string) {
    return this.db.select().from(transcripts).where(eq(transcripts.id, id)).get();
  }
}
