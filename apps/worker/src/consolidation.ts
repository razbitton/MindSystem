import { findSimilarMemory } from "@personal-context-os/shared";
import type { Pool } from "pg";

type ConsolidationJobInput = {
  workspaceId: string;
  dryRun: boolean;
  limit: number;
};

export async function runMemoryConsolidationJob(pool: Pool, input: ConsolidationJobInput) {
  const duplicateGroups = await findDuplicateGroups(pool, input);
  const staleMemories = await findStaleMemories(pool, input);
  const repeatedPreferences = await findRepeatedPreferences(pool, input);

  const counts = {
    duplicateGroups: duplicateGroups.length,
    staleMemories: staleMemories.length,
    repeatedPreferences: repeatedPreferences.length,
    reviewItems: 0
  };

  if (input.dryRun) return { ...counts, dryRun: true };

  for (const group of duplicateGroups) {
    const payload = {
      kind: group.kind,
      title: group.title,
      body: group.body,
      summary: group.summary,
      importance: group.importance,
      confidence: Number(group.confidence_score ?? 0.8),
      memoryId: group.target_memory_id,
      targetMemoryId: group.target_memory_id,
      duplicateMemoryIds: group.duplicate_memory_ids,
      customFields: { consolidationReason: "duplicate_title_or_semantic_similarity" }
    };
    counts.reviewItems += await insertReviewItem(pool, input.workspaceId, "duplicate_memory_candidate", "merge_memory_records", payload, group.target_memory_id);
  }

  for (const memory of staleMemories) {
    counts.reviewItems += await insertReviewItem(pool, input.workspaceId, "stale_memory_candidate", "mark_memory_stale", {
      memoryId: memory.id,
      title: memory.title,
      staleAfter: memory.stale_after,
      expiresAt: memory.expires_at
    }, memory.id);
  }

  for (const preference of repeatedPreferences) {
    counts.reviewItems += await insertReviewItem(pool, input.workspaceId, "stable_preference_candidate", "pin_preference", {
      memoryId: preference.id,
      title: preference.title,
      sourceCount: preference.source_count
    }, preference.id);
  }

  return { ...counts, dryRun: false };
}

async function findDuplicateGroups(pool: Pool, input: ConsolidationJobInput) {
  const result = await pool.query<{
    id: string;
    kind: string;
    title: string;
    body: string;
    summary: string | null;
    importance: string;
    confidence_score: string;
  }>(
    `select mr.id,
            mr.kind::text,
            mr.title,
            mr.body,
            mr.summary,
            mr.importance::text,
            mr.confidence_score::text
     from memory_records mr
     where mr.workspace_id = $1
       and mr.status = 'active'
       and mr.validity = 'current'
     order by mr.updated_at desc
     limit $2`,
    [input.workspaceId, Math.min(input.limit * 10, 1000)]
  );
  const rows = result.rows;
  const used = new Set<string>();
  const groups: Array<{
    kind: string;
    title: string;
    body: string;
    summary: string | null;
    importance: string;
    confidence_score: string;
    target_memory_id: string;
    duplicate_memory_ids: string[];
  }> = [];

  for (const row of rows) {
    if (used.has(row.id)) continue;
    const duplicateIds = rows
      .filter((candidate) => candidate.id !== row.id && !used.has(candidate.id) && candidate.kind === row.kind)
      .filter((candidate) => findSimilarMemory([row], candidate))
      .map((candidate) => candidate.id);

    if (!duplicateIds.length) continue;
    groups.push({
      kind: row.kind,
      title: row.title,
      body: row.body,
      summary: row.summary,
      importance: row.importance,
      confidence_score: row.confidence_score,
      target_memory_id: row.id,
      duplicate_memory_ids: duplicateIds
    });
    used.add(row.id);
    for (const id of duplicateIds) used.add(id);
    if (groups.length >= input.limit) break;
  }

  return groups;
}

async function findStaleMemories(pool: Pool, input: ConsolidationJobInput) {
  const result = await pool.query<{ id: string; title: string; stale_after: Date | null; expires_at: Date | null }>(
    `select id, title, stale_after, expires_at
     from memory_records
     where workspace_id = $1
       and status = 'active'
       and validity = 'current'
       and (
         (stale_after is not null and stale_after <= now())
         or (expires_at is not null and expires_at <= now())
       )
     order by coalesce(stale_after, expires_at) asc
     limit $2`,
    [input.workspaceId, input.limit]
  );
  return result.rows;
}

async function findRepeatedPreferences(pool: Pool, input: ConsolidationJobInput) {
  const result = await pool.query<{ id: string; title: string; source_count: number }>(
    `select mr.id, mr.title, count(ms.id)::int as source_count
     from memory_records mr
     left join memory_sources ms on ms.memory_record_id = mr.id
     where mr.workspace_id = $1
       and mr.status = 'active'
       and mr.validity = 'current'
       and mr.kind = 'preference'
       and coalesce((mr.custom_fields ->> 'pinned')::boolean, false) = false
     group by mr.id
     having count(ms.id) >= 2
     order by count(ms.id) desc, mr.updated_at desc
     limit $2`,
    [input.workspaceId, input.limit]
  );
  return result.rows;
}

async function insertReviewItem(
  pool: Pool,
  workspaceId: string,
  reason: string,
  suggestedAction: string,
  payload: Record<string, unknown>,
  targetMemoryId: string
) {
  const result = await pool.query(
    `insert into review_queue (workspace_id, reason, suggested_action, suggested_payload)
     select $1, $2, $3, $4::jsonb
     where not exists (
       select 1
       from review_queue
       where workspace_id = $1
         and status = 'pending'
         and suggested_action = $3
         and suggested_payload @> $5::jsonb
     )`,
    [workspaceId, reason, suggestedAction, JSON.stringify(payload), JSON.stringify({ memoryId: targetMemoryId })]
  );
  return result.rowCount ?? 0;
}
