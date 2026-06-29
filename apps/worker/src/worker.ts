import { loadEnv } from "@personal-context-os/config";
import { createDb } from "@personal-context-os/db";
import { OpenAIEmbeddingClient, vectorToSql } from "@personal-context-os/ai";
import { Worker } from "bullmq";

const env = loadEnv();
const { pool } = createDb(env.DATABASE_URL);
const connection = { url: env.REDIS_URL };

const embeddingWorker = new Worker(
  "embeddings",
  async (job) => {
    const entityId = String(job.data.entityId);
    if (!env.OPENAI_API_KEY) {
      await pool.query(
        `update chunks
         set metadata = metadata || jsonb_build_object('embedding_status', 'skipped_no_api_key', 'embedding_model', $2)
         where entity_id = $1`,
        [entityId, env.OPENAI_EMBEDDING_MODEL]
      );
      return { entityId, embedded: false, reason: "OPENAI_API_KEY is not configured." };
    }

    const client = new OpenAIEmbeddingClient({
      apiKey: env.OPENAI_API_KEY,
      apiBaseUrl: env.OPENAI_API_BASE_URL,
      model: env.OPENAI_EMBEDDING_MODEL
    });
    const chunks = await pool.query<{ id: string; chunk_text: string }>(
      `select id, chunk_text
       from chunks
       where entity_id = $1
       order by chunk_index`,
      [entityId]
    );

    let embedded = 0;
    for (const chunk of chunks.rows) {
      try {
        const embedding = await client.embed(chunk.chunk_text);
        await pool.query(
          `update chunks
           set embedding = $2::vector,
               metadata = metadata || jsonb_build_object('embedding_status', 'embedded', 'embedding_model', $3)
           where id = $1`,
          [chunk.id, vectorToSql(embedding), env.OPENAI_EMBEDDING_MODEL]
        );
        embedded += 1;
      } catch (error) {
        await pool.query(
          `update chunks
           set metadata = metadata || jsonb_build_object('embedding_status', 'failed', 'embedding_model', $2, 'embedding_error', $3)
           where id = $1`,
          [chunk.id, env.OPENAI_EMBEDDING_MODEL, error instanceof Error ? error.message : "Embedding failed"]
        );
      }
    }

    return { entityId, embedded };
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
