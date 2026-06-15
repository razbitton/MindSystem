import { loadEnv } from "@personal-context-os/config";
import { createDb } from "@personal-context-os/db";
import { Worker } from "bullmq";

const env = loadEnv();
const { pool } = createDb(env.DATABASE_URL);
const connection = { url: env.REDIS_URL };

const embeddingWorker = new Worker(
  "embeddings",
  async (job) => {
    const entityId = String(job.data.entityId);
    await pool.query(
      `update chunks
       set metadata = metadata || jsonb_build_object('embedding_status', 'queued_placeholder', 'embedding_model', 'none')
       where entity_id = $1`,
      [entityId]
    );
    return { entityId, embedded: false };
  },
  { connection }
);

const dashboardWorker = new Worker(
  "dashboard",
  async (job) => {
    return {
      workspaceId: job.data.workspaceId,
      recalculated: false,
      reason: "Dashboard is calculated on demand in the MVP."
    };
  },
  { connection }
);

for (const worker of [embeddingWorker, dashboardWorker]) {
  worker.on("completed", (job) => console.log(`Completed ${job.queueName}:${job.name}:${job.id}`));
  worker.on("failed", (job, error) => console.error(`Failed ${job?.queueName}:${job?.name}:${job?.id}`, error));
}

process.on("SIGTERM", async () => {
  await Promise.all([embeddingWorker.close(), dashboardWorker.close()]);
  await pool.end();
  process.exit(0);
});

console.log("Personal Context OS worker started");
