import { auditEvents } from "@personal-context-os/db";
import { desc, eq } from "drizzle-orm";
import type { Actor, AppContext } from "./types.js";

export async function writeAuditEvent(
  context: AppContext,
  input: Actor & {
    action: string;
    entityId?: string | null;
    rawItemId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const [event] = await context.db
    .insert(auditEvents)
    .values({
      workspaceId: context.workspaceId,
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      entityId: input.entityId ?? null,
      rawItemId: input.rawItemId ?? null,
      metadata: input.metadata ?? {}
    })
    .returning();
  return event;
}

export async function listAuditEvents(context: AppContext) {
  const events = await context.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.workspaceId, context.workspaceId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(100);

  return { events };
}
