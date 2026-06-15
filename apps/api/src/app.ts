import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { loadEnv } from "@personal-context-os/config";
import { createDb, ensureDefaultWorkspace } from "@personal-context-os/db";
import Fastify from "fastify";
import { registerRoutes } from "./routes.js";
import { ensureBootstrapPassword } from "./services/auth.js";

export async function createApp() {
  const env = loadEnv();
  const app = Fastify({ logger: true });
  const database = createDb(env.DATABASE_URL);
  const bootstrap = await ensureDefaultWorkspace(database.db, {
    userEmail: env.BOOTSTRAP_USER_EMAIL,
    userDisplayName: env.BOOTSTRAP_USER_NAME
  });
  const baseContext = {
    db: database.db,
    pool: database.pool,
    env,
    workspaceId: bootstrap.workspace.id,
    userId: bootstrap.user?.id ?? null
  };
  await ensureBootstrapPassword(baseContext, env.BOOTSTRAP_USER_PASSWORD);

  await app.register(cors, {
    origin: [env.APP_BASE_URL, "http://localhost:3000"],
    credentials: true
  });

  await app.register(rateLimit, {
    max: 1000,
    timeWindow: "1 minute"
  });

  app.decorate("context", baseContext);

  app.addHook("onClose", async () => {
    await database.pool.end();
  });

  await registerRoutes(app);
  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    context: {
      db: ReturnType<typeof createDb>["db"];
      pool: ReturnType<typeof createDb>["pool"];
      env: ReturnType<typeof loadEnv>;
      workspaceId: string;
      userId: string | null;
    };
  }
}
