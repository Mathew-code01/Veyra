import { customType, integer, text } from "drizzle-orm/sqlite-core";

export const createdAt = () =>
  text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString());

export const updatedAt = () =>
  text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString());

export const nullableTimestamp = (name: string) => text(name);

export const jsonText = <T>(name: string) =>
  customType<{ data: T; driverData: string }>({
    dataType() {
      return "text";
    },
    toDriver(value) {
      return JSON.stringify(value);
    },
    fromDriver(value) {
      return JSON.parse(String(value)) as T;
    },
  })(name);

export const booleanInteger = (name: string) =>
  integer(name, { mode: "boolean" }).notNull().default(false);

export const idColumn = () => text("id").primaryKey();

export function now(): string {
  return new Date().toISOString();
}
