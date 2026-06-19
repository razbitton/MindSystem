import { auditEvents } from "@personal-context-os/db";
import { and, desc, eq } from "drizzle-orm";
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

export async function deleteAuditEvent(context: AppContext, id: string) {
  const [event] = await context.db
    .delete(auditEvents)
    .where(and(eq(auditEvents.workspaceId, context.workspaceId), eq(auditEvents.id, id)))
    .returning({ id: auditEvents.id });

  if (!event) throw new Error("Audit event not found");
  return { ok: true };
}

export async function clearAuditEvents(context: AppContext) {
  const result = await context.pool.query(
    `delete from audit_events
     where workspace_id = $1`,
    [context.workspaceId]
  );
  return { ok: true, deletedAuditEvents: result.rowCount ?? 0 };
}
