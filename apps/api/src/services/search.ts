import type { SearchQuery } from "@personal-context-os/shared";
import { retrievalLogs } from "@personal-context-os/db";
import type { AppContext } from "./types.js";

export interface SearchSql {
  sql: string;
  params: unknown[];
}

export function buildSearchSql(workspaceId: string, query: SearchQuery): SearchSql {
  const params: unknown[] = [workspaceId];
  const where = ["e.workspace_id = $1", "e.archived_at is null"];
  let qIndex: number | null = null;

  if (query.entity_type) {
    params.push(query.entity_type);
    where.push(`e.entity_type = $${params.length}`);
  }
  if (query.status) {
    params.push(query.status);
    where.push(`(e.status = $${params.length} or t.status::text = $${params.length} or p.status::text = $${params.length})`);
  }
  if (query.project_id) {
    params.push(query.project_id);
    where.push(`(t.project_id = $${params.length} or n.project_id = $${params.length} or d.project_id = $${params.length} or r.project_id = $${params.length} or p.id = $${params.length})`);
  }
  if (query.due_before) {
    params.push(new Date(query.due_before));
    where.push(`(t.due_at <= $${params.length} or p.due_at <= $${params.length} or r.remind_at <= $${params.length})`);
  }
  if (query.q?.trim()) {
    params.push(query.q.trim());
    qIndex = params.length;
    where.push(`(
      c.fts @@ plainto_tsquery('english', $${qIndex})
      or e.title ilike '%' || $${qIndex} || '%'
      or coalesce(e.body, '') ilike '%' || $${qIndex} || '%'
      or coalesce(e.summary, '') ilike '%' || $${qIndex} || '%'
    )`);
  }

  params.push(query.limit);
  const limitIndex = params.length;
  const rank = qIndex ? `coalesce(max(ts_rank(c.fts, plainto_tsquery('english', $${qIndex}))), 0)` : "0";

  return {
    params,
    sql: `
      select e.id, e.id as entity_id, e.id as "entityId",
             coalesce(max(t.id::text), max(p.id::text), max(n.id::text), max(d.id::text), max(r.id::text), e.id::text)::uuid as typed_id,
             coalesce(max(t.id::text), max(p.id::text), max(n.id::text), max(d.id::text), max(r.id::text), e.id::text)::uuid as "typedId",
             max(t.id::text)::uuid as task_id, max(t.id::text)::uuid as "taskId",
             max(p.id::text)::uuid as project_id, max(p.id::text)::uuid as "projectId",
             max(n.id::text)::uuid as note_id, max(n.id::text)::uuid as "noteId",
             max(d.id::text)::uuid as document_id, max(d.id::text)::uuid as "documentId",
             max(r.id::text)::uuid as reminder_id, max(r.id::text)::uuid as "reminderId",
             e.entity_type, e.entity_type as "entityType", e.title, e.summary, e.body, e.status, e.canonical,
             e.custom_fields, e.confidence_score, e.created_at, e.updated_at,
             max(t.assignee) as assignee, max(t.priority::text) as priority,
             ${rank} as rank
      from entities e
      left join chunks c on c.entity_id = e.id
      left join projects p on p.entity_id = e.id
      left join tasks t on t.entity_id = e.id
      left join notes n on n.entity_id = e.id
      left join documents d on d.entity_id = e.id
      left join reminders r on r.entity_id = e.id
      where ${where.join(" and ")}
      group by e.id
      order by rank desc, e.updated_at desc
      limit $${limitIndex}
    `
  };
}

export async function searchMemory(context: AppContext, query: SearchQuery) {
  const built = buildSearchSql(context.workspaceId, query);
  const result = await context.pool.query(built.sql, built.params);

  await context.db.insert(retrievalLogs).values({
    workspaceId: context.workspaceId,
    query: query.q ?? "",
    filters: {
      ...query,
      mode: query.q?.trim() ? "keyword" : "filtered-list"
    },
    resultCount: result.rowCount ?? 0
  });

  return {
    results: result.rows,
    retrieval: {
      mode: query.q?.trim() ? "keyword" : "filtered-list",
      vectorReady: false,
      count: result.rowCount ?? 0
    }
  };
}
