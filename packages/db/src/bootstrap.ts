import { eq } from "drizzle-orm";
import type { DbClient } from "./client.js";
import { users, workspaces } from "./schema.js";

export interface DefaultWorkspaceOptions {
  userEmail?: string;
  userDisplayName?: string;
  syncExistingUser?: boolean;
}

export async function ensureDefaultWorkspace(db: DbClient, options: DefaultWorkspaceOptions = {}) {
  const userEmail = options.userEmail ?? "admin@me.com";
  const userDisplayName = options.userDisplayName ?? "Local User";

  const [existing] = await db.select().from(workspaces).where(eq(workspaces.slug, "default")).limit(1);
  if (existing) {
    const [user] = await db.select().from(users).where(eq(users.workspaceId, existing.id)).limit(1);
    if (!user) return { workspace: existing, user: null };

    if (options.syncExistingUser && (user.email !== userEmail || user.displayName !== userDisplayName)) {
      const [updated] = await db
        .update(users)
        .set({ email: userEmail, displayName: userDisplayName })
        .where(eq(users.id, user.id))
        .returning();
      return { workspace: existing, user: updated ?? user };
    }

    return { workspace: existing, user };
  }

  const [workspace] = await db
    .insert(workspaces)
    .values({ name: "Personal Workspace", slug: "default" })
    .returning();

  if (!workspace) {
    throw new Error("Failed to bootstrap workspace");
  }

  const [user] = await db
    .insert(users)
    .values({
      workspaceId: workspace.id,
      email: userEmail,
      displayName: userDisplayName
    })
    .returning();

  return { workspace, user: user ?? null };
}
