import { aiProcessingBackfillSchema, aiProcessingRunsQuerySchema, aiProcessingScheduleSchema } from "@personal-context-os/shared";
import { aiProcessingRuns, aiProcessingSchedules } from "@personal-context-os/db";
import { and, desc, eq } from "drizzle-orm";
import { writeAuditEvent } from "./audit.js";
import { enqueueAiProcessingRun } from "./queues.js";
import type { Actor, AppContext } from "./types.js";

export async function listAiProcessingRuns(context: AppContext, query: unknown = {}) {
  const filters = aiProcessingRunsQuerySchema.parse(query ?? {});
  const where = [eq(aiProcessingRuns.workspaceId, context.workspaceId)];
  if (filters.status) where.push(eq(aiProcessingRuns.status, filters.status));

  const runs = await context.db
    .select()
    .from(aiProcessingRuns)
    .where(and(...where))
    .orderBy(desc(aiProcessingRuns.createdAt))
    .limit(filters.limit);

  return { runs };
}

export async function startAiMemoryBackfill(context: AppContext, input: unknown, actor: Actor) {
  const parsed = aiProcessingBackfillSchema.parse(input ?? {});
  const [run] = await context.db
    .insert(aiProcessingRuns)
    .values({
      workspaceId: context.workspaceId,
      runType: "memory_backfill",
      status: "queued",
      requestedByUserId: context.userId,
      sourceTypes: parsed.sourceTypes,
      rawItemIds: parsed.rawItemIds,
      onlyUnprocessed: parsed.onlyUnprocessed,
      dryRun: parsed.dryRun,
      limitCount: parsed.limit,
      batchSize: parsed.batchSize,
      since: parsed.since ? new Date(parsed.since) : null,
      until: parsed.until ? new Date(parsed.until) : null
    })
    .returning();

  if (!run) throw new Error("Failed to create AI processing run.");

  try {
    await enqueueAiProcessingRun(context, run.id);
  } catch (error) {
    await context.db
      .update(aiProcessingRuns)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : "Failed to enqueue AI processing run.",
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(aiProcessingRuns.id, run.id));
    throw error;
  }

  await writeAuditEvent(context, {
    ...actor,
    action: "ai memory backfill queued",
    metadata: {
      runId: run.id,
      dryRun: parsed.dryRun,
      onlyUnprocessed: parsed.onlyUnprocessed,
      limit: parsed.limit
    }
  });

  return { run };
}

export async function getAiProcessingSchedule(context: AppContext) {
  const [schedule] = await context.db
    .select()
    .from(aiProcessingSchedules)
    .where(eq(aiProcessingSchedules.workspaceId, context.workspaceId))
    .limit(1);

  return {
    schedule: schedule ?? {
      id: null,
      workspaceId: context.workspaceId,
      enabled: false,
      intervalMinutes: 1440,
      sourceTypes: [],
      onlyUnprocessed: true,
      dryRun: false,
      limitCount: 100,
      batchSize: 25,
      nextRunAt: null,
      lastRunAt: null,
      createdAt: null,
      updatedAt: null
    }
  };
}

export async function updateAiProcessingSchedule(context: AppContext, input: unknown, actor: Actor) {
  const parsed = aiProcessingScheduleSchema.parse(input ?? {});
  const now = new Date();
  const nextRunAt = parsed.enabled ? new Date(now.getTime() + parsed.intervalMinutes * 60_000) : null;
  const values = {
    workspaceId: context.workspaceId,
    enabled: parsed.enabled,
    intervalMinutes: parsed.intervalMinutes,
    sourceTypes: parsed.sourceTypes,
    onlyUnprocessed: parsed.onlyUnprocessed,
    dryRun: parsed.dryRun,
    limitCount: parsed.limit,
    batchSize: parsed.batchSize,
    nextRunAt,
    updatedAt: now
  };

  const [schedule] = await context.db
    .insert(aiProcessingSchedules)
    .values(values)
    .onConflictDoUpdate({
      target: [aiProcessingSchedules.workspaceId],
      set: values
    })
    .returning();

  await writeAuditEvent(context, {
    ...actor,
    action: parsed.enabled ? "ai processing schedule enabled" : "ai processing schedule disabled",
    metadata: {
      intervalMinutes: parsed.intervalMinutes,
      limit: parsed.limit,
      batchSize: parsed.batchSize,
      sourceTypes: parsed.sourceTypes
    }
  });

  return { schedule };
}
