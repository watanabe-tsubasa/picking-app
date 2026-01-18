import { drizzle as drizzleLibsql, type LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

const env = process.env.ENV ?? "development";
const useTurso = env === "staging" || env === "production";

type DbType = LibSQLDatabase<typeof schema>;

async function createDb(): Promise<DbType> {
  if (useTurso) {
    const url = process.env.TURSO_URL;
    if (!url) {
      throw new Error("TURSO_URL is required when ENV is staging/production.");
    }
    const client = createClient({ url, authToken: process.env.TURSO_TOKEN });
    return drizzleLibsql(client, { schema });
  }

  // local/dev: bun-only modules are imported lazily
  const [{ drizzle: drizzleBunSqlite }, { Database }] = await Promise.all([
    import("drizzle-orm/bun-sqlite"),
    import("bun:sqlite"),
  ]);

  const sqlite = new Database(process.env.DATABASE_URL || "local.db");
  return (drizzleBunSqlite(sqlite, { schema }) as unknown) as DbType;
}

// top-level await（Vite/React Router の SSR は ESM なのでOKなことが多い）
export const db: DbType = await createDb();

export * from "./schema";
