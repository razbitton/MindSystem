import { Queue } from "bullmq";
import type { AppContext } from "./types.js";

let embeddingQueue: Queue | null = null;
let dashboardQueue: Queue | null = null;
let aiProcessingQueue: Queue | null = null;

function getQueues(context: AppContext) {
  const connection = { url: context.env.REDIS_URL };
  embeddingQueue ??= new Queue("embeddings", { connection });
  dashboardQueue ??= new Queue("dashboard", { connection });
  aiProcessingQueue ??= new Queue("ai-processing", { connection });
  return { embeddingQueue, dashboardQueue, aiProcessingQueue };
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
