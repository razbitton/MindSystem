import type { createDb } from "@personal-context-os/db";
import type { loadEnv } from "@personal-context-os/config";

export interface AppContext {
  db: ReturnType<typeof createDb>["db"];
  pool: ReturnType<typeof createDb>["pool"];
  env: ReturnType<typeof loadEnv>;
  workspaceId: string;
  userId: string | null;
}

export interface Actor {
  actorType: "user" | "agent" | "system";
  actorId: string | null;
}
