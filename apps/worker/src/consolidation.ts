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
    reviewItems: 0,
    autoApplied: 0
  };

  if (input.dryRun) return { ...counts, dryRun: true };

  for (const group of duplicateGroups) {
    if (group.match_type === "exact") {
      counts.autoApplied += await autoMergeExactDuplicateGroup(pool, input.workspaceId, group);
      continue;
    }

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
      customFields: { consolidationReason: "semantic_duplicate_similarity" }
    };
    counts.reviewItems += await insertReviewItem(pool, input.workspaceId, "semantic_duplicate_memory_candidate", "merge_memory_records", payload, group.target_memory_id);
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
    counts.autoApplied += await autoPinRepeatedPreference(pool, input.workspaceId, preference);
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
    match_type: "exact" | "semantic";
  }> = [];

  for (const row of rows) {
    if (used.has(row.id)) continue;
    const matchingRows = rows
      .filter((candidate) => candidate.id !== row.id && !used.has(candidate.id) && candidate.kind === row.kind)
      .filter((candidate) => findSimilarMemory([row], candidate));
    const exactRows = matchingRows.filter((candidate) => isExactDuplicate(row, candidate));
    const duplicateIds = matchingRows.map((candidate) => candidate.id);

    if (!duplicateIds.length) continue;
    groups.push({
      kind: row.kind,
      title: row.title,
      body: row.body,
      summary: row.summary,
      importance: row.importance,
      confidence_score: row.confidence_score,
      target_memory_id: row.id,
      duplicate_memory_ids: duplicateIds,
      match_type: exactRows.length === matchingRows.length ? "exact" : "semantic"
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
     having count(ms.id) >= 3
     order by count(ms.id) desc, mr.updated_at desc
     limit $2`,
    [input.workspaceId, input.limit]
  );
  return result.rows;
}

async function autoMergeExactDuplicateGroup(
  pool: Pool,
  workspaceId: string,
  group: {
    target_memory_id: string;
    duplicate_memory_ids: string[];
    title: string;
    confidence_score: string;
  }
) {
  const result = await pool.query(
    `with moved_sources as (
       update memory_sources
       set memory_record_id = $2
       where workspace_id = $1
         and memory_record_id = any($3::uuid[])
       returning id
     ),
     superseded as (
       update memory_records
       set status = 'superseded',
           validity = 'superseded',
           superseded_by_memory_id = $2,
           confidence_reason = 'Auto-merged exact duplicate during consolidation.',
           updated_at = now()
       where workspace_id = $1
         and id = any($3::uuid[])
       returning id
     )
     insert into ai_activity_log (
       workspace_id,
       actor_type,
       operation_type,
       decision,
       reason,
       affected_records,
       previous_values,
       new_values,
       confidence,
       source_reliability,
       input,
       undo_status
     )
     select $1,
            'system',
            'consolidate_memory',
            'auto_apply_with_audit'::ai_operation_decision,
            'auto_merged_exact_duplicate_memory',
            jsonb_build_array(jsonb_build_object('type', 'memory_record', 'id', $2)),
            jsonb_build_object('duplicateMemoryIds', $3),
            jsonb_build_object('targetMemoryId', $2, 'movedSourceCount', (select count(*) from moved_sources), 'supersededCount', (select count(*) from superseded)),
            $4,
            0.95,
            jsonb_build_object('title', $5, 'duplicateMemoryIds', $3),
            'available'
     where exists (select 1 from superseded)`,
    [workspaceId, group.target_memory_id, group.duplicate_memory_ids, group.confidence_score, group.title]
  );
  return result.rowCount ?? 0;
}

async function autoPinRepeatedPreference(pool: Pool, workspaceId: string, preference: { id: string; title: string; source_count: number }) {
  const result = await pool.query(
    `with pinned as (
       update memory_records
       set importance = 'high',
           custom_fields = custom_fields || $3::jsonb,
           last_verified_at = now(),
           validity = 'current',
           updated_at = now()
       where workspace_id = $1
         and id = $2
         and kind = 'preference'
         and coalesce((custom_fields ->> 'pinned')::boolean, false) = false
       returning id
     )
     insert into ai_activity_log (
       workspace_id,
       actor_type,
       operation_type,
       decision,
       reason,
       affected_records,
       new_values,
       confidence,
       source_reliability,
       input,
       undo_status
     )
     select $1,
            'system',
            'consolidate_memory',
            'auto_apply_with_audit'::ai_operation_decision,
            'auto_pinned_repeated_preference',
            jsonb_build_array(jsonb_build_object('type', 'memory_record', 'id', $2)),
            jsonb_build_object('pinned', true, 'sourceCount', $4),
            0.9,
            0.9,
            jsonb_build_object('title', $5, 'sourceCount', $4),
            'available'
     where exists (select 1 from pinned)`,
    [
      workspaceId,
      preference.id,
      JSON.stringify({ pinned: true, pinnedReason: "Repeated preference with at least three independent sources." }),
      preference.source_count,
      preference.title
    ]
  );
  return result.rowCount ?? 0;
}

function isExactDuplicate(left: { title: string; body: string }, right: { title: string; body: string }) {
  return normalize(left.title) === normalize(right.title) && normalize(left.body) === normalize(right.body);
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
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
