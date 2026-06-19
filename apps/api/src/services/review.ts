import { reviewQueue } from "@personal-context-os/db";
import { desc, eq, and } from "drizzle-orm";
import { createTaskSchema, type reviewDecisionSchema } from "@personal-context-os/shared";
import { z } from "zod";
import { createNote } from "./notes.js";
import { createProject } from "./projects.js";
import { createTask } from "./tasks.js";
import { writeAuditEvent } from "./audit.js";
import type { Actor, AppContext } from "./types.js";

type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

const reviewQueueListQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "all"]).default("pending")
});

export async function listReviewQueue(context: AppContext, query: unknown = {}) {
  const filters = reviewQueueListQuerySchema.parse(query ?? {});
  const where = [eq(reviewQueue.workspaceId, context.workspaceId)];
  if (filters.status !== "all") where.push(eq(reviewQueue.status, filters.status));

  const items = await context.db
    .select()
    .from(reviewQueue)
    .where(and(...where))
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
    applied = await createTask(context, createTaskSchema.parse(payload), actor);
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

export async function deleteReviewItem(context: AppContext, id: string, actor: Actor) {
  const [item] = await context.db
    .delete(reviewQueue)
    .where(and(eq(reviewQueue.workspaceId, context.workspaceId), eq(reviewQueue.id, id)))
    .returning({ id: reviewQueue.id, rawItemId: reviewQueue.rawItemId, suggestedAction: reviewQueue.suggestedAction });

  if (!item) throw new Error("Review item not found");
  await writeAuditEvent(context, { ...actor, action: "review delete", rawItemId: item.rawItemId, metadata: { reviewItemId: id, suggestedAction: item.suggestedAction } });
  return { ok: true };
}

export async function clearReviewQueue(context: AppContext, actor: Actor) {
  const result = await context.pool.query(
    `delete from review_queue
     where workspace_id = $1`,
    [context.workspaceId]
  );
  await writeAuditEvent(context, { ...actor, action: "review clear", metadata: { deletedReviewItems: result.rowCount ?? 0 } });
  return { ok: true, deletedReviewItems: result.rowCount ?? 0 };
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
