import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

let _db: LibSQLDatabase<typeof schema> | null = null;

function getDb(): LibSQLDatabase<typeof schema> {
  if (_db) return _db;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error(
      "Database not configured: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set",
    );
  }

  const client = createClient({ url, authToken });
  _db = drizzle(client, { schema });
  return _db;
}

// Proxy that lazily initializes the DB on first property access
export const db = new Proxy({} as LibSQLDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
