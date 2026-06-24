import { loadEnv } from "@personal-context-os/config";
import { createDb, ensureDefaultWorkspace } from "@personal-context-os/db";
import Fastify from "fastify";
import { registerMcpRoutes } from "./routes.js";

export async function createMcpApp() {
  const env = loadEnv();
  const database = createDb(env.DATABASE_URL);
  await ensureDefaultWorkspace(database.db);

  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true }));

  app.addHook("onClose", async () => {
    await database.pool.end();
  });

  await registerMcpRoutes(app, { db: database.db, apiBaseUrl: env.API_BASE_URL });
  return app;
}
