import { aiActivityLog, aiOperationPolicies } from "@personal-context-os/db";
import {
  aiOperationPolicyPatchSchema,
  decideAiOperation,
  getDefaultAiOperationPolicy,
  type AiAutonomyMode,
  type AiOperationDecision,
  type AiOperationPolicy,
  type AiOperationSignal,
  type AiOperationType
} from "@personal-context-os/shared";
import { desc, eq } from "drizzle-orm";
import { writeAuditEvent } from "./audit.js";
import type { Actor, AppContext } from "./types.js";

type ActivityPayload = Actor & {
  operationType: AiOperationType;
  decision: AiOperationDecision;
  reason: string;
  rawItemId?: string | null;
  entityId?: string | null;
  affectedRecords?: unknown[];
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  confidence?: number | null;
  sourceReliability?: number | null;
  input?: Record<string, unknown>;
  runId?: string | null;
  undoStatus?: string;
};

export async function getAiOperationPolicy(context: AppContext): Promise<AiOperationPolicy> {
  const [stored] = await context.db
    .select()
    .from(aiOperationPolicies)
    .where(eq(aiOperationPolicies.workspaceId, context.workspaceId))
    .limit(1);

  if (!stored) return getDefaultAiOperationPolicy("balanced");

  return {
    mode: stored.mode as AiAutonomyMode,
    autoApplyMinConfidence: Number(stored.autoApplyMinConfidence),
    reviewBelowConfidence: Number(stored.reviewBelowConfidence),
    requireReviewForDestructive: stored.requireReviewForDestructive,
    requireReviewForSensitive: stored.requireReviewForSensitive,
    requireReviewForConflicts: stored.requireReviewForConflicts,
    requireReviewForBulkChanges: stored.requireReviewForBulkChanges,
    maxAutoApplyBatchSize: stored.maxAutoApplyBatchSize
  };
}

export async function decideWorkspaceAiOperation(context: AppContext, operation: AiOperationSignal) {
  return decideAiOperation(await getAiOperationPolicy(context), operation);
}

export async function getAiOperationPolicySettings(context: AppContext) {
  return { policy: await getAiOperationPolicy(context) };
}

export async function updateAiOperationPolicy(context: AppContext, input: unknown, actor: Actor) {
  const parsed = aiOperationPolicyPatchSchema.parse(input ?? {});
  const defaults = getDefaultAiOperationPolicy(parsed.mode);
  const nextPolicy: AiOperationPolicy = {
    mode: parsed.mode,
    autoApplyMinConfidence: parsed.autoApplyMinConfidence ?? defaults.autoApplyMinConfidence,
    reviewBelowConfidence: parsed.reviewBelowConfidence ?? defaults.reviewBelowConfidence,
    requireReviewForDestructive: parsed.requireReviewForDestructive ?? defaults.requireReviewForDestructive,
    requireReviewForSensitive: parsed.requireReviewForSensitive ?? defaults.requireReviewForSensitive,
    requireReviewForConflicts: parsed.requireReviewForConflicts ?? defaults.requireReviewForConflicts,
    requireReviewForBulkChanges: parsed.requireReviewForBulkChanges ?? defaults.requireReviewForBulkChanges,
    maxAutoApplyBatchSize: parsed.maxAutoApplyBatchSize ?? defaults.maxAutoApplyBatchSize
  };

  if (nextPolicy.reviewBelowConfidence > nextPolicy.autoApplyMinConfidence) {
    throw new Error("reviewBelowConfidence must be less than or equal to autoApplyMinConfidence.");
  }
  const now = new Date();
  const values = {
    workspaceId: context.workspaceId,
    mode: nextPolicy.mode,
    autoApplyMinConfidence: String(nextPolicy.autoApplyMinConfidence),
    reviewBelowConfidence: String(nextPolicy.reviewBelowConfidence),
    requireReviewForDestructive: nextPolicy.requireReviewForDestructive,
    requireReviewForSensitive: nextPolicy.requireReviewForSensitive,
    requireReviewForConflicts: nextPolicy.requireReviewForConflicts,
    requireReviewForBulkChanges: nextPolicy.requireReviewForBulkChanges,
    maxAutoApplyBatchSize: nextPolicy.maxAutoApplyBatchSize,
    updatedAt: now
  };

  const [policy] = await context.db
    .insert(aiOperationPolicies)
    .values(values)
    .onConflictDoUpdate({
      target: [aiOperationPolicies.workspaceId],
      set: values
    })
    .returning();

  await writeAuditEvent(context, {
    ...actor,
    action: "ai operation policy updated",
    metadata: {
      mode: nextPolicy.mode,
      autoApplyMinConfidence: nextPolicy.autoApplyMinConfidence,
      reviewBelowConfidence: nextPolicy.reviewBelowConfidence,
      maxAutoApplyBatchSize: nextPolicy.maxAutoApplyBatchSize
    }
  });

  return { policy };
}

export async function writeAiActivity(context: AppContext, input: ActivityPayload) {
  const [entry] = await context.db
    .insert(aiActivityLog)
    .values({
      workspaceId: context.workspaceId,
      runId: input.runId ?? null,
      actorType: input.actorType,
      actorId: input.actorId,
      operationType: input.operationType,
      decision: input.decision,
      reason: input.reason,
      rawItemId: input.rawItemId ?? null,
      entityId: input.entityId ?? null,
      affectedRecords: input.affectedRecords ?? [],
      previousValues: input.previousValues ?? {},
      newValues: input.newValues ?? {},
      confidence: input.confidence === undefined || input.confidence === null ? null : String(input.confidence),
      sourceReliability: input.sourceReliability === undefined || input.sourceReliability === null ? null : String(input.sourceReliability),
      input: input.input ?? {},
      undoStatus: input.undoStatus ?? "not_available"
    })
    .returning();

  return entry;
}

export async function listAiActivity(context: AppContext) {
  const entries = await context.db
    .select()
    .from(aiActivityLog)
    .where(eq(aiActivityLog.workspaceId, context.workspaceId))
    .orderBy(desc(aiActivityLog.createdAt))
    .limit(100);

  return { entries };
}
