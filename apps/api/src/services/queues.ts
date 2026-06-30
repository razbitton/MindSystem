import { Queue } from "bullmq";
import type { AppContext } from "./types.js";

let embeddingQueue: Queue | null = null;
let dashboardQueue: Queue | null = null;
let aiProcessingQueue: Queue | null = null;
let memoryConsolidationQueue: Queue | null = null;

function getQueues(context: AppContext) {
  const connection = { url: context.env.REDIS_URL };
  embeddingQueue ??= new Queue("embeddings", { connection });
  dashboardQueue ??= new Queue("dashboard", { connection });
  aiProcessingQueue ??= new Queue("ai-processing", { connection });
  memoryConsolidationQueue ??= new Queue("memory-consolidation", { connection });
  return { embeddingQueue, dashboardQueue, aiProcessingQueue, memoryConsolidationQueue };
}

export async function enqueuePostIngestJobs(context: AppContext, entityIds: string[]) {
  try {
    const queues = getQueues(context);
    for (const entityId of entityIds) {
      await queues.embeddingQueue.add("embed_entity", { entityId, workspaceId: context.workspaceId });
    }
    await queues.dashboardQueue.add("recalculate_today", { workspaceId: context.workspaceId });
  } catch (error) {
    await context.pool.query("select 1");
    console.warn("Queue enqueue failed; continuing without background jobs", error);
  }
}

export async function enqueueAiProcessingRun(context: AppContext, runId: string) {
  const queues = getQueues(context);
  await queues.aiProcessingQueue.add("run_memory_backfill", { runId, workspaceId: context.workspaceId }, {
    jobId: `ai-processing-run-${runId}`,
    attempts: 1
  });
}

export async function enqueueMemoryConsolidation(context: AppContext, input: { dryRun: boolean; limit: number }) {
  const queues = getQueues(context);
  await queues.memoryConsolidationQueue.add("consolidate_memory", {
    workspaceId: context.workspaceId,
    dryRun: input.dryRun,
    limit: input.limit
  }, {
    jobId: `memory-consolidation-${context.workspaceId}`,
    attempts: 1
  });
}
