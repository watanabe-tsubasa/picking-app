import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Load .env.local first, then .env
config({ path: ".env.local" });
config({ path: ".env" });

const env = process.env.ENV ?? "development";
const useTurso = env === "staging" || env === "production";

export default defineConfig({
  schema: "./app/db/schema.ts",
  out: "./drizzle",
  dialect: useTurso ? "turso" : "sqlite",
  dbCredentials: useTurso
    ? {
        url: process.env.TURSO_URL!,
        authToken: process.env.TURSO_TOKEN,
      }
    : {
        url: process.env.DATABASE_URL || "file:./local.db",
      },
});
