import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

export type DatabaseInstance = ReturnType<typeof createDatabase>;

export interface DatabaseOptions {
  filename?: string;
  migrationsFolder?: string;
  readonly?: boolean;
}

function resolveDatabasePath(filename?: string): string {
  const configured = filename ?? process.env.VEYRA_DATABASE_PATH ?? "./data/veyra.db";
  return resolve(process.cwd(), configured);
}

export function createDatabase(options: DatabaseOptions = {}) {
  const filename = resolveDatabasePath(options.filename);
  mkdirSync(dirname(filename), { recursive: true });

  const sqlite = new Database(filename, {
    readonly: options.readonly ?? false,
    fileMustExist: options.readonly ?? false,
  });

  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("temp_store = MEMORY");

  const db = drizzle(sqlite, { schema });

  if (!options.readonly) {
    const migrationsFolder = resolve(
      process.cwd(),
      options.migrationsFolder ?? "./database/migrations",
    );
    migrate(db, { migrationsFolder });
  }

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
    healthCheck: () => {
      sqlite.prepare("SELECT 1").get();
      return true;
    },
  };
}

let singleton: ReturnType<typeof createDatabase> | undefined;

export function getDatabase(): DatabaseInstance {
  if (!singleton) singleton = createDatabase();
  return singleton;
}

export function closeDatabase(): void {
  singleton?.close();
  singleton = undefined;
}

export function withTransaction<T>(
  callback: (tx: DatabaseInstance["db"]) => T,
): T {
  const { db } = getDatabase();
  return db.transaction(callback);
}
