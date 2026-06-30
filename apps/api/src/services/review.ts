import { memoryRecords, memorySources, reviewQueue } from "@personal-context-os/db";
import { desc, eq, and } from "drizzle-orm";
import {
  createTaskSchema,
  memoryCandidateSchema,
  projectColorSchema,
  reviewMergeSchema,
  reviewSupersedeSchema,
  type reviewDecisionSchema
} from "@personal-context-os/shared";
import { z } from "zod";
import { createNote } from "./notes.js";
import { createProject } from "./projects.js";
import { createTask } from "./tasks.js";
import { createMemoryRecordFromCandidate, supersedeMemory } from "./memory.js";
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
  const item = await getReviewItem(context, id);

  const payload = (input.editedPayload ?? item.suggestedPayload) as Record<string, unknown>;
  let applied: unknown = null;

  if (item.suggestedAction === "create_task" && typeof payload.title === "string") {
    applied = await createTask(context, createTaskSchema.parse(payload), actor);
  }
  if (item.suggestedAction === "create_note" && typeof payload.title === "string") {
    applied = await createNote(context, { title: payload.title, body: stringOrUndefined(payload.body) ?? payload.title }, actor);
  }
  if (item.suggestedAction === "create_project" && typeof payload.title === "string") {
    const parsedColor = projectColorSchema.safeParse(payload.color);
    applied = await createProject(context, {
      name: payload.title,
      description: stringOrUndefined(payload.description),
      color: parsedColor.success ? parsedColor.data : null
    }, actor);
  }
  if (item.suggestedAction === "create_memory_record" && typeof payload.title === "string") {
    applied = await createMemoryRecordFromCandidate(context, {
      candidate: memoryCandidateSchema.parse(payload),
      rawItemId: item.rawItemId,
      actor
    });
  }

  const [updated] = await context.db
    .update(reviewQueue)
    .set({ status: "approved", resolvedAt: new Date(), resolvedByUserId: context.userId })
    .where(and(eq(reviewQueue.workspaceId, context.workspaceId), eq(reviewQueue.id, id)))
    .returning();

  await writeAuditEvent(context, { ...actor, action: "review approve", rawItemId: item.rawItemId, metadata: { reviewItemId: id } });
  return { item: updated, applied };
}

export async function mergeReviewItem(context: AppContext, id: string, input: unknown, actor: Actor) {
  const item = await getReviewItem(context, id);
  const parsed = reviewMergeSchema.parse(input ?? {});
  const payload = (parsed.editedPayload ?? item.suggestedPayload) as Record<string, unknown>;
  const candidate = memoryCandidateSchema.parse(payload);
  const [targetMemory] = await context.db
    .select()
    .from(memoryRecords)
    .where(and(eq(memoryRecords.workspaceId, context.workspaceId), eq(memoryRecords.id, parsed.targetMemoryId)))
    .limit(1);
  if (!targetMemory) throw new Error("Target memory not found");

  const mergedReviewItemIds = uniqueStrings([
    ...arrayOfStrings(recordObject(targetMemory.customFields).mergedReviewItemIds),
    id
  ]);
  const [target] = await context.db
    .update(memoryRecords)
    .set({
      lastSeenAt: new Date(),
      lastVerifiedAt: new Date(),
      validity: "current",
      confidenceScore: String(mergeReviewConfidence(targetMemory.confidenceScore, candidate.confidence)),
      customFields: buildReviewMergeCustomFields(targetMemory.customFields, targetCustomFields(payload), mergedReviewItemIds, item.reason),
      updatedAt: new Date()
    })
    .where(and(eq(memoryRecords.workspaceId, context.workspaceId), eq(memoryRecords.id, parsed.targetMemoryId)))
    .returning();
  if (!target) throw new Error("Target memory not found");

  if (item.rawItemId) {
    await context.db.insert(memorySources).values({
      workspaceId: context.workspaceId,
      memoryRecordId: parsed.targetMemoryId,
      rawItemId: item.rawItemId,
      sourceQuote: candidate.sourceQuote ?? null,
      metadata: { confidence: candidate.confidence, mergedFromReviewItemId: id }
    }).onConflictDoNothing();
  }

  const updated = await resolveReviewItem(context, id);
  await writeAuditEvent(context, {
    ...actor,
    action: "review merge",
    rawItemId: item.rawItemId,
    metadata: { reviewItemId: id, targetMemoryId: parsed.targetMemoryId }
  });
  return { item: updated, applied: { memory: target } };
}

export async function supersedeReviewItem(context: AppContext, id: string, input: unknown, actor: Actor) {
  const item = await getReviewItem(context, id);
  const parsed = reviewSupersedeSchema.parse(input ?? {});
  const payload = (parsed.editedPayload ?? item.suggestedPayload) as Record<string, unknown>;
  const replacement = memoryCandidateSchema.parse(payload);
  const applied = await supersedeMemory(context, parsed.targetMemoryId, {
    replacement,
    reason: parsed.reason ?? item.reason
  }, actor);
  const updated = await resolveReviewItem(context, id);
  await writeAuditEvent(context, {
    ...actor,
    action: "review supersede",
    rawItemId: item.rawItemId,
    metadata: { reviewItemId: id, targetMemoryId: parsed.targetMemoryId }
  });
  return { item: updated, applied };
}

export async function markReviewMemoryStale(context: AppContext, id: string, actor: Actor) {
  const item = await getReviewItem(context, id);
  const targetMemoryId = stringOrUndefined((item.suggestedPayload as Record<string, unknown>).targetMemoryId)
    ?? stringOrUndefined((item.suggestedPayload as Record<string, unknown>).memoryId);
  if (!targetMemoryId) throw new Error("Review item does not identify a target memory.");

  const [memory] = await context.db
    .update(memoryRecords)
    .set({
      validity: "stale",
      staleAfter: new Date(),
      confidenceReason: `Marked stale from review item ${id}: ${item.reason}`,
      updatedAt: new Date()
    })
    .where(and(eq(memoryRecords.workspaceId, context.workspaceId), eq(memoryRecords.id, targetMemoryId)))
    .returning();
  if (!memory) throw new Error("Target memory not found");

  const updated = await resolveReviewItem(context, id);
  await writeAuditEvent(context, {
    ...actor,
    action: "review mark stale",
    rawItemId: item.rawItemId,
    metadata: { reviewItemId: id, targetMemoryId }
  });
  return { item: updated, applied: { memory } };
}

export async function pinReviewPreference(context: AppContext, id: string, actor: Actor) {
  const item = await getReviewItem(context, id);
  const targetMemoryId = stringOrUndefined((item.suggestedPayload as Record<string, unknown>).targetMemoryId)
    ?? stringOrUndefined((item.suggestedPayload as Record<string, unknown>).memoryId);
  if (!targetMemoryId) throw new Error("Review item does not identify a target memory.");

  const [targetMemory] = await context.db
    .select()
    .from(memoryRecords)
    .where(and(eq(memoryRecords.workspaceId, context.workspaceId), eq(memoryRecords.id, targetMemoryId), eq(memoryRecords.kind, "preference")))
    .limit(1);
  if (!targetMemory) throw new Error("Target preference memory not found");

  const [memory] = await context.db
    .update(memoryRecords)
    .set({
      importance: "high",
      customFields: buildPinnedPreferenceCustomFields(targetMemory.customFields, id),
      lastVerifiedAt: new Date(),
      validity: "current",
      updatedAt: new Date()
    })
    .where(and(eq(memoryRecords.workspaceId, context.workspaceId), eq(memoryRecords.id, targetMemoryId), eq(memoryRecords.kind, "preference")))
    .returning();
  if (!memory) throw new Error("Target preference memory not found");

  const updated = await resolveReviewItem(context, id);
  await writeAuditEvent(context, {
    ...actor,
    action: "review pin preference",
    rawItemId: item.rawItemId,
    metadata: { reviewItemId: id, targetMemoryId }
  });
  return { item: updated, applied: { memory } };
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

async function getReviewItem(context: AppContext, id: string) {
  const [item] = await context.db
    .select()
    .from(reviewQueue)
    .where(and(eq(reviewQueue.workspaceId, context.workspaceId), eq(reviewQueue.id, id)))
    .limit(1);
  if (!item) throw new Error("Review item not found");
  return item;
}

async function resolveReviewItem(context: AppContext, id: string) {
  const [updated] = await context.db
    .update(reviewQueue)
    .set({ status: "approved", resolvedAt: new Date(), resolvedByUserId: context.userId })
    .where(and(eq(reviewQueue.workspaceId, context.workspaceId), eq(reviewQueue.id, id)))
    .returning();
  return updated;
}

function targetCustomFields(payload: Record<string, unknown>) {
  const value = payload.customFields;
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function mergeReviewConfidence(existingConfidence: string | number | null | undefined, candidateConfidence: number) {
  return Math.max(Number(existingConfidence) || 0, candidateConfidence, 0.8);
}

export function buildReviewMergeCustomFields(
  existingCustomFields: unknown,
  candidateCustomFields: Record<string, unknown>,
  mergedReviewItemIds: string[],
  reason: string
) {
  return mergeObjects(recordObject(existingCustomFields), candidateCustomFields, {
    mergedReviewItemIds,
    lastMergeReason: reason
  });
}

export function buildPinnedPreferenceCustomFields(existingCustomFields: unknown, reviewItemId: string) {
  return mergeObjects(recordObject(existingCustomFields), {
    pinned: true,
    pinnedFromReviewItemId: reviewItemId
  });
}

function recordObject(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function mergeObjects(...objects: Record<string, unknown>[]) {
  return Object.assign({}, ...objects);
}
