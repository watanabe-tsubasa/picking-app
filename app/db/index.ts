import { drizzle as drizzleBunSqlite } from "drizzle-orm/bun-sqlite";
import { drizzle as drizzleLibsql, type LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { Database } from "bun:sqlite";
import * as schema from "./schema";

const env = process.env.ENV ?? "development";
const useTurso = env === "staging" || env === "production";

type DbType = LibSQLDatabase<typeof schema>;

function createDb(): DbType {
  if (useTurso) {
    const url = process.env.TURSO_URL;
    if (!url) {
      throw new Error("TURSO_URL is required when ENV is staging/production.");
    }
    const client = createClient({ url, authToken: process.env.TURSO_TOKEN });
    return drizzleLibsql(client, { schema });
  }

  const sqlite = new Database(process.env.DATABASE_URL || "local.db");
  // BunSQLite drizzle is compatible with LibSQL drizzle API
  return drizzleBunSqlite(sqlite, { schema }) as unknown as DbType;
}

export const db = createDb();

export * from "./schema";
