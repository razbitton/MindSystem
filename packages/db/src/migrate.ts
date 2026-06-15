import { loadEnv } from "@personal-context-os/config";
import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;

async function main() {
  const env = loadEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const root = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = join(root, "../migrations");
  const migrationFiles = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of migrationFiles) {
    const sql = await readFile(join(migrationsDir, file), "utf8");
    await pool.query(sql);
    console.log(`Applied migration ${file}`);
  }
  await pool.end();
  console.log("Database migrations applied");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
