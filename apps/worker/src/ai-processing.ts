import type { AppEnv } from "@personal-context-os/config";
import { OpenAICodexMemoryExtractor, OpenAIMemoryExtractor, type MemoryExtractionResult } from "@personal-context-os/ai";
import type { Queue } from "bullmq";
import type { Pool, PoolClient } from "pg";
import { resolveOpenAICodexAccessTokenForWorkspace } from "./openai-codex-token.js";

const AUTO_APPLY_CONFIDENCE = 0.75;
const chunkSize = 1800;

type MemoryCandidate = MemoryExtractionResult["candidates"][number];

type AiProcessingRunRow = {
  id: string;
  workspace_id: string;
  status: string;
  source_types: string[];
  raw_item_ids: string[];
  only_unprocessed: boolean;
  dry_run: boolean;
  limit_count: number;
  batch_size: number;
  since: Date | null;
  until: Date | null;
};

type RawItemRow = {
  id: string;
  workspace_id: string;
  source_type: string;
  raw_text: string;
  created_at: Date;
};

type MemoryRow = {
  id: string;
  entity_id: string;
  confidence_score: string;
};

type ProcessingCounts = {
  processed: number;
  skipped: number;
  created: number;
  updated: number;
  review: number;
  failed: number;
};

export async function runAiProcessingJob(pool: Pool, env: AppEnv, runId: string) {
  const run = await loadRun(pool, runId);
  if (!run) throw new Error(`AI processing run not found: ${runId}`);
  if (!["queued", "running"].includes(run.status)) return { runId, skipped: true, reason: `Run status is ${run.status}.` };

  await pool.query(
    `update ai_processing_runs
     set status = 'running',
         started_at = coalesce(started_at, now()),
         updated_at = now()
     where id = $1`,
    [run.id]
  );

  const rawItems = await selectRawItems(pool, run);
  await pool.query(
    `update ai_processing_runs
     set total_count = $2,
         updated_at = now()
     where id = $1`,
    [run.id, rawItems.length]
  );

  const counts: ProcessingCounts = { processed: 0, skipped: 0, created: 0, updated: 0, review: 0, failed: 0 };
  const extractor = createExtractor(pool, env, run.workspace_id);

  try {
    for (const rawItem of rawItems) {
      try {
        const extraction = await extractor.extract({ text: rawItem.raw_text });
        const itemCounts = await applyMemoryExtraction(pool, run, rawItem, extraction);
        addCounts(counts, itemCounts);
        counts.processed += 1;
      } catch (error) {
        counts.failed += 1;
        if (!run.dry_run) {
          await insertReviewItem(pool, run.workspace_id, rawItem.id, "ai_processing_item_failed", "inspect_raw_item", {
            rawItemId: rawItem.id,
            error: error instanceof Error ? error.message : "AI processing failed."
          });
        }
      }

      await updateRunCounts(pool, run.id, counts);
    }

    await pool.query(
      `update ai_processing_runs
       set status = 'completed',
           completed_at = now(),
           updated_at = now()
       where id = $1`,
      [run.id]
    );
    return { runId: run.id, ...counts };
  } catch (error) {
    await pool.query(
      `update ai_processing_runs
       set status = 'failed',
           error = $2,
           completed_at = now(),
           updated_at = now()
       where id = $1`,
      [run.id, error instanceof Error ? error.message : "AI processing run failed."]
    );
    throw error;
  }
}

export async function enqueueDueAiProcessingRuns(pool: Pool, queue: Queue) {
  const result = await pool.query<{ id: string; workspace_id: string }>(
    `with due as (
       select s.*
       from ai_processing_schedules s
       where s.enabled = true
         and s.next_run_at is not null
         and s.next_run_at <= now()
         and not exists (
           select 1
           from ai_processing_runs r
           where r.workspace_id = s.workspace_id
             and r.run_type = 'memory_backfill'
             and r.status in ('queued', 'running')
         )
       order by s.next_run_at
       limit 20
     ), advanced as (
       update ai_processing_schedules s
       set last_run_at = now(),
           next_run_at = now() + s.interval_minutes * interval '1 minute',
           updated_at = now()
       from due
       where s.id = due.id
       returning s.*
     )
     insert into ai_processing_runs (
       workspace_id,
       run_type,
       status,
       requested_by_user_id,
       source_types,
       raw_item_ids,
       only_unprocessed,
       dry_run,
       limit_count,
       batch_size
     )
     select
       workspace_id,
       'memory_backfill',
       'queued',
       null,
       source_types,
       ARRAY[]::uuid[],
       only_unprocessed,
       dry_run,
       limit_count,
       batch_size
     from advanced
     returning id, workspace_id`
  );

  for (const run of result.rows) {
    await queue.add("run_memory_backfill", { runId: run.id, workspaceId: run.workspace_id }, {
      jobId: `ai-processing-run-${run.id}`,
      attempts: 1
    });
  }

  return result.rows.length;
}

async function loadRun(pool: Pool, runId: string) {
  const result = await pool.query<AiProcessingRunRow>(
    `select id, workspace_id, status, source_types, raw_item_ids, only_unprocessed, dry_run, limit_count, batch_size, since, until
     from ai_processing_runs
     where id = $1`,
    [runId]
  );
  return result.rows[0] ?? null;
}

async function selectRawItems(pool: Pool, run: AiProcessingRunRow) {
  const params: unknown[] = [run.workspace_id];
  const where = ["ri.workspace_id = $1"];

  if (run.raw_item_ids.length) {
    params.push(run.raw_item_ids);
    where.push(`ri.id = any($${params.length}::uuid[])`);
  }
  if (run.source_types.length) {
    params.push(run.source_types);
    where.push(`ri.source_type::text = any($${params.length}::text[])`);
  }
  if (run.since) {
    params.push(run.since);
    where.push(`ri.received_at >= $${params.length}`);
  }
  if (run.until) {
    params.push(run.until);
    where.push(`ri.received_at <= $${params.length}`);
  }
  if (run.only_unprocessed) {
    where.push(`not exists (
      select 1
      from memory_sources ms
      where ms.raw_item_id = ri.id
    )`);
    where.push(`not exists (
      select 1
      from review_queue rq
      where rq.raw_item_id = ri.id
        and rq.status = 'pending'
        and rq.suggested_action in ('create_memory_record', 'inspect_raw_item')
    )`);
  }

  params.push(run.limit_count);
  const result = await pool.query<RawItemRow>(
    `select ri.id, ri.workspace_id, ri.source_type::text as source_type, ri.raw_text, ri.created_at
     from raw_items ri
     where ${where.join(" and ")}
     order by ri.created_at asc
     limit $${params.length}`,
    params
  );
  return result.rows;
}

function createExtractor(pool: Pool, env: AppEnv, workspaceId: string) {
  if (env.OPENAI_AUTH_MODE === "codex") {
    return new OpenAICodexMemoryExtractor({
      tokenProvider: () => resolveOpenAICodexAccessTokenForWorkspace(pool, env, workspaceId),
      apiBaseUrl: env.OPENAI_CODEX_BASE_URL,
      model: env.OPENAI_CODEX_EXTRACTION_MODEL
    });
  }

  return new OpenAIMemoryExtractor({
    apiKey: env.OPENAI_API_KEY ?? "",
    apiBaseUrl: env.OPENAI_API_BASE_URL,
    model: env.OPENAI_EXTRACTION_MODEL
  });
}

async function applyMemoryExtraction(
  pool: Pool,
  run: AiProcessingRunRow,
  rawItem: RawItemRow,
  extraction: MemoryExtractionResult
): Promise<ProcessingCounts> {
  const counts: ProcessingCounts = { processed: 0, skipped: 0, created: 0, updated: 0, review: 0, failed: 0 };

  if (!extraction.candidates.length) {
    counts.review += 1;
    if (!run.dry_run) {
      await insertReviewItem(pool, run.workspace_id, rawItem.id, "no_memory_candidates", "inspect_raw_item", {
        rawItemId: rawItem.id,
        sourceType: rawItem.source_type
      });
    }
    return counts;
  }

  for (const candidate of extraction.candidates) {
    if (candidate.confidence < AUTO_APPLY_CONFIDENCE) {
      counts.review += 1;
      if (!run.dry_run) {
        await insertReviewItem(pool, run.workspace_id, rawItem.id, "low_confidence_memory_backfill", "create_memory_record", candidate);
      }
      continue;
    }

    const existing = await findDuplicateMemory(pool, run.workspace_id, candidate);
    if (run.dry_run) {
      if (existing) counts.updated += 1;
      else counts.created += 1;
      continue;
    }

    if (existing) {
      await refreshExistingMemory(pool, run.workspace_id, existing, rawItem.id, candidate);
      counts.updated += 1;
    } else {
      await createMemoryRecordFromCandidate(pool, run, rawItem.id, candidate);
      counts.created += 1;
    }
  }

  if (extraction.degraded) {
    counts.review += 1;
    if (!run.dry_run) {
      await insertReviewItem(pool, run.workspace_id, rawItem.id, "memory_extraction_degraded", "inspect_raw_item", {
        rawItemId: rawItem.id,
        error: extraction.error ?? "Memory extraction degraded."
      });
    }
  }

  return counts;
}

async function findDuplicateMemory(pool: Pool, workspaceId: string, candidate: MemoryCandidate) {
  const result = await pool.query<MemoryRow>(
    `select id, entity_id, confidence_score::text
     from memory_records
     where workspace_id = $1
       and kind = $2::memory_kind
       and status = 'active'
       and title ilike $3
     limit 1`,
    [workspaceId, candidate.kind, candidate.title.trim()]
  );
  return result.rows[0] ?? null;
}

async function refreshExistingMemory(
  pool: Pool,
  workspaceId: string,
  existing: MemoryRow,
  rawItemId: string,
  candidate: MemoryCandidate
) {
  const nextConfidence = Math.max(Number(existing.confidence_score), candidate.confidence);
  await pool.query(
    `update memory_records
     set last_seen_at = now(),
         confidence_score = $2,
         updated_at = now()
     where id = $1`,
    [existing.id, String(nextConfidence)]
  );
  await createMemorySource(pool, workspaceId, existing.id, rawItemId, candidate);
}

async function createMemoryRecordFromCandidate(pool: Pool, run: AiProcessingRunRow, rawItemId: string, candidate: MemoryCandidate) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const projectId = await resolveProjectId(client, run.workspace_id, candidate);
    const entityResult = await client.query<{ id: string }>(
      `insert into entities (
         workspace_id,
         entity_type,
         title,
         summary,
         body,
         status,
         canonical,
         custom_fields,
         source_raw_item_id,
         confidence_score
       )
       values ($1, 'memory', $2, $3, $4, 'active', $5::jsonb, $6::jsonb, $7, $8)
       returning id`,
      [
        run.workspace_id,
        candidate.title,
        candidate.summary ?? candidate.body.slice(0, 180),
        candidate.body,
        JSON.stringify(candidate),
        JSON.stringify({ memoryKind: candidate.kind, importance: candidate.importance }),
        rawItemId,
        String(candidate.confidence)
      ]
    );
    const entityId = entityResult.rows[0]?.id;
    if (!entityId) throw new Error("Failed to create memory entity.");

    await createChunks(client, run.workspace_id, entityId, [candidate.title, candidate.summary, candidate.body].filter(Boolean).join("\n\n"));

    const memoryResult = await client.query<{ id: string }>(
      `insert into memory_records (
         workspace_id,
         entity_id,
         project_id,
         source_raw_item_id,
         kind,
         status,
         importance,
         title,
         summary,
         body,
         confidence_score,
         occurred_at,
         custom_fields
       )
       values ($1, $2, $3, $4, $5::memory_kind, 'active', $6::memory_importance, $7, $8, $9, $10, $11, $12::jsonb)
       returning id`,
      [
        run.workspace_id,
        entityId,
        projectId,
        rawItemId,
        candidate.kind,
        candidate.importance,
        candidate.title,
        candidate.summary ?? null,
        candidate.body,
        String(candidate.confidence),
        candidate.occurredAt ? new Date(candidate.occurredAt) : null,
        JSON.stringify(candidate.customFields)
      ]
    );
    const memoryId = memoryResult.rows[0]?.id;
    if (!memoryId) throw new Error("Failed to create memory record.");

    await createMemorySource(client, run.workspace_id, memoryId, rawItemId, candidate);
    await createAliases(client, run.workspace_id, entityId, candidate.aliases);
    await createMemoryLinks(client, run.workspace_id, entityId, candidate.relatedEntities);
    if (projectId) await linkMemoryToProject(client, run.workspace_id, entityId, projectId, candidate.confidence);
    await client.query(
      `insert into audit_events (workspace_id, actor_type, actor_id, action, entity_id, raw_item_id, metadata)
       values ($1, 'system', $2, 'create memory from ai backfill', $3, $4, $5::jsonb)`,
      [run.workspace_id, run.id, entityId, rawItemId, JSON.stringify({ memoryId, kind: candidate.kind })]
    );

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function resolveProjectId(client: PoolClient, workspaceId: string, candidate: MemoryCandidate) {
  if (candidate.projectId) {
    const result = await client.query<{ id: string }>(
      `select id
       from projects
       where workspace_id = $1
         and id = $2
       limit 1`,
      [workspaceId, candidate.projectId]
    );
    if (result.rows[0]) return result.rows[0].id;
  }

  if (!candidate.projectTitle) return null;
  const result = await client.query<{ id: string }>(
    `select id
     from projects
     where workspace_id = $1
       and name ilike $2
     limit 1`,
    [workspaceId, candidate.projectTitle.trim()]
  );
  return result.rows[0]?.id ?? null;
}

async function createChunks(client: PoolClient, workspaceId: string, entityId: string, text: string) {
  const pieces = text.match(new RegExp(`[\\s\\S]{1,${chunkSize}}`, "g")) ?? [text];
  for (let index = 0; index < pieces.length; index += 1) {
    await client.query(
      `insert into chunks (workspace_id, entity_id, chunk_text, chunk_index, metadata)
       values ($1, $2, $3, $4, $5::jsonb)`,
      [workspaceId, entityId, pieces[index] ?? "", index, JSON.stringify({ entityType: "memory" })]
    );
  }
}

async function createMemorySource(
  clientOrPool: Pool | PoolClient,
  workspaceId: string,
  memoryRecordId: string,
  rawItemId: string,
  candidate: MemoryCandidate
) {
  await clientOrPool.query(
    `insert into memory_sources (workspace_id, memory_record_id, raw_item_id, source_quote, metadata)
     select $1, $2, $3, $4, $5::jsonb
     where not exists (
       select 1
       from memory_sources
       where memory_record_id = $2
         and raw_item_id = $3
     )`,
    [workspaceId, memoryRecordId, rawItemId, candidate.sourceQuote ?? null, JSON.stringify({ confidence: candidate.confidence })]
  );
}

async function createAliases(client: PoolClient, workspaceId: string, entityId: string, aliases: string[]) {
  for (const alias of aliases) {
    await client.query(
      `insert into entity_aliases (workspace_id, entity_id, alias)
       values ($1, $2, $3)
       on conflict do nothing`,
      [workspaceId, entityId, alias]
    );
  }
}

async function createMemoryLinks(
  client: PoolClient,
  workspaceId: string,
  fromEntityId: string,
  references: MemoryCandidate["relatedEntities"]
) {
  for (const reference of references) {
    const toEntityId = reference.entityId ?? (reference.title ? await findEntityByTitleOrAlias(client, workspaceId, reference.title) : null);
    if (!toEntityId) continue;
    await insertEntityEdge(client, workspaceId, fromEntityId, toEntityId, reference.relationType, 1);
  }
}

async function linkMemoryToProject(client: PoolClient, workspaceId: string, memoryEntityId: string, projectId: string, confidence: number) {
  const result = await client.query<{ entity_id: string }>(
    `select entity_id
     from projects
     where workspace_id = $1
       and id = $2
     limit 1`,
    [workspaceId, projectId]
  );
  const projectEntityId = result.rows[0]?.entity_id;
  if (!projectEntityId) return;
  await insertEntityEdge(client, workspaceId, memoryEntityId, projectEntityId, "belongs_to", confidence);
}

async function insertEntityEdge(
  client: PoolClient,
  workspaceId: string,
  fromEntityId: string,
  toEntityId: string,
  relationType: string,
  confidence: number
) {
  await client.query(
    `insert into entity_edges (workspace_id, from_entity_id, to_entity_id, relation_type, confidence_score)
     select $1, $2, $3, $4::relation_type, $5
     where not exists (
       select 1
       from entity_edges
       where workspace_id = $1
         and from_entity_id = $2
         and to_entity_id = $3
         and relation_type = $4::relation_type
     )`,
    [workspaceId, fromEntityId, toEntityId, relationType, String(confidence)]
  );
}

async function findEntityByTitleOrAlias(client: PoolClient, workspaceId: string, title: string) {
  const entityResult = await client.query<{ id: string }>(
    `select id
     from entities
     where workspace_id = $1
       and title ilike $2
     limit 1`,
    [workspaceId, title.trim()]
  );
  if (entityResult.rows[0]) return entityResult.rows[0].id;

  const aliasResult = await client.query<{ entity_id: string }>(
    `select e.id as entity_id
     from entity_aliases ea
     join entities e on e.id = ea.entity_id
     where ea.workspace_id = $1
       and ea.alias ilike $2
     limit 1`,
    [workspaceId, title.trim()]
  );
  return aliasResult.rows[0]?.entity_id ?? null;
}

async function insertReviewItem(
  pool: Pool,
  workspaceId: string,
  rawItemId: string,
  reason: string,
  suggestedAction: string,
  suggestedPayload: unknown
) {
  await pool.query(
    `insert into review_queue (workspace_id, raw_item_id, reason, suggested_action, suggested_payload)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [workspaceId, rawItemId, reason, suggestedAction, JSON.stringify(suggestedPayload)]
  );
}

function addCounts(target: ProcessingCounts, next: ProcessingCounts) {
  target.skipped += next.skipped;
  target.created += next.created;
  target.updated += next.updated;
  target.review += next.review;
  target.failed += next.failed;
}

async function updateRunCounts(pool: Pool, runId: string, counts: ProcessingCounts) {
  await pool.query(
    `update ai_processing_runs
     set processed_count = $2,
         skipped_count = $3,
         created_count = $4,
         updated_count = $5,
         review_count = $6,
         failed_count = $7,
         updated_at = now()
     where id = $1`,
    [runId, counts.processed, counts.skipped, counts.created, counts.updated, counts.review, counts.failed]
  );
}
