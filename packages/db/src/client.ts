import { loadEnv } from "@personal-context-os/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const { Pool } = pg;

export function createPool(databaseUrl = loadEnv().DATABASE_URL) {
  return new Pool({ connectionString: databaseUrl });
}

export function createDb(databaseUrl = loadEnv().DATABASE_URL) {
  const pool = createPool(databaseUrl);
  return {
    db: drizzle(pool, { schema }),
    pool
  };
}

export type DbClient = ReturnType<typeof createDb>["db"];
