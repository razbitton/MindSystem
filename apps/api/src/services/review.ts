import { reviewQueue } from "@personal-context-os/db";
import { desc, eq, and } from "drizzle-orm";
import type { reviewDecisionSchema } from "@personal-context-os/shared";
import type { z } from "zod";
import { createNote } from "./notes.js";
import { createProject } from "./projects.js";
import { createTask } from "./tasks.js";
import { writeAuditEvent } from "./audit.js";
import type { Actor, AppContext } from "./types.js";

type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

export async function listReviewQueue(context: AppContext) {
  const items = await context.db
    .select()
    .from(reviewQueue)
    .where(and(eq(reviewQueue.workspaceId, context.workspaceId), eq(reviewQueue.status, "pending")))
    .orderBy(desc(reviewQueue.createdAt))
    .limit(200);

  return { items };
}

export async function approveReviewItem(context: AppContext, id: string, input: ReviewDecision, actor: Actor) {
  const [item] = await context.db
    .select()
    .from(reviewQueue)
    .where(and(eq(reviewQueue.workspaceId, context.workspaceId), eq(reviewQueue.id, id)))
    .limit(1);
  if (!item) throw new Error("Review item not found");

  const payload = (input.editedPayload ?? item.suggestedPayload) as Record<string, unknown>;
  let applied: unknown = null;

  if (item.suggestedAction === "create_task" && typeof payload.title === "string") {
    applied = await createTask(context, { title: payload.title, description: stringOrUndefined(payload.description) }, actor);
  }
  if (item.suggestedAction === "create_note" && typeof payload.title === "string") {
    applied = await createNote(context, { title: payload.title, body: stringOrUndefined(payload.body) ?? payload.title }, actor);
  }
  if (item.suggestedAction === "create_project" && typeof payload.title === "string") {
    applied = await createProject(context, { name: payload.title, description: stringOrUndefined(payload.description) }, actor);
  }

  const [updated] = await context.db
    .update(reviewQueue)
    .set({ status: "approved", resolvedAt: new Date(), resolvedByUserId: context.userId })
    .where(and(eq(reviewQueue.workspaceId, context.workspaceId), eq(reviewQueue.id, id)))
    .returning();

  await writeAuditEvent(context, { ...actor, action: "review approve", rawItemId: item.rawItemId, metadata: { reviewItemId: id } });
  return { item: updated, applied };
}

export async function rejectReviewItem(context: AppContext, id: string, actor: Actor) {
  const [updated] = await context.db
    .update(reviewQueue)
    .set({ status: "rejected", resolvedAt: new Date(), resolvedByUserId: context.userId })
    .where(and(eq(reviewQueue.workspaceId, context.workspaceId), eq(reviewQueue.id, id)))
    .returning();

  if (!updated) throw new Error("Review item not found");
  await writeAuditEvent(context, { ...actor, action: "review reject", rawItemId: updated.rawItemId, metadata: { reviewItemId: id } });
  return { item: updated };
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
