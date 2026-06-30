import { aiActivityLog, aiOperationPolicies } from "@personal-context-os/db";
import {
  decideAiOperation,
  getDefaultAiOperationPolicy,
  type AiAutonomyMode,
  type AiOperationDecision,
  type AiOperationPolicy,
  type AiOperationSignal,
  type AiOperationType
} from "@personal-context-os/shared";
import { desc, eq } from "drizzle-orm";
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
