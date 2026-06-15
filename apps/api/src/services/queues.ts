import { Queue } from "bullmq";
import type { AppContext } from "./types.js";

let embeddingQueue: Queue | null = null;
let dashboardQueue: Queue | null = null;

function getQueues(context: AppContext) {
  const connection = { url: context.env.REDIS_URL };
  embeddingQueue ??= new Queue("embeddings", { connection });
  dashboardQueue ??= new Queue("dashboard", { connection });
  return { embeddingQueue, dashboardQueue };
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
