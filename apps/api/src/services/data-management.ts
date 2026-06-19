import { purgeWorkspaceDataSchema, type PurgeDataType } from "@personal-context-os/shared";
import { writeAuditEvent } from "./audit.js";
import type { Actor, AppContext } from "./types.js";

const inventoryTables = [
  ["rawItems", "raw_items"],
  ["entities", "entities"],
  ["projects", "projects"],
  ["tasks", "tasks"],
  ["notes", "notes"],
  ["documents", "documents"],
  ["reminders", "reminders"],
  ["reviewQueue", "review_queue"],
  ["auditEvents", "audit_events"],
  ["agentRuns", "agent_runs"],
  ["retrievalLogs", "retrieval_logs"],
  ["schemaDefinitions", "schema_definitions"],
  ["projectSchemaOverrides", "project_schema_overrides"]
] as const;

const purgeStatements: { type: PurgeDataType; resultKey: string; sql: string }[] = [
  {
    type: "project_schema_overrides",
    resultKey: "deletedProjectSchemaOverrides",
    sql: "delete from project_schema_overrides where workspace_id = $1"
  },
  {
    type: "schema_definitions",
    resultKey: "deletedSchemaDefinitions",
    sql: "delete from schema_definitions where workspace_id = $1"
  },
  {
    type: "retrieval_logs",
    resultKey: "deletedRetrievalLogs",
    sql: "delete from retrieval_logs where workspace_id = $1"
  },
  {
    type: "agent_runs",
    resultKey: "deletedAgentRuns",
    sql: "delete from agent_runs where workspace_id = $1"
  },
  {
    type: "review_queue",
    resultKey: "deletedReviewItems",
    sql: "delete from review_queue where workspace_id = $1"
  },
  {
    type: "entities",
    resultKey: "deletedEntities",
    sql: "delete from entities where workspace_id = $1"
  },
  {
    type: "raw_items",
    resultKey: "deletedRawItems",
    sql: "delete from raw_items where workspace_id = $1"
  },
  {
    type: "audit_events",
    resultKey: "deletedAuditEvents",
    sql: "delete from audit_events where workspace_id = $1"
  }
];

export async function getDataInventory(context: AppContext) {
  const entries = await Promise.all(
    inventoryTables.map(async ([key, table]) => {
      const result = await context.pool.query(
        `select count(*)::int as count from ${table}
         where workspace_id = $1`,
        [context.workspaceId]
      );
      return [key, Number(result.rows[0]?.count ?? 0)] as const;
    })
  );

  return { counts: Object.fromEntries(entries) };
}

export async function purgeWorkspaceData(context: AppContext, input: unknown, actor: Actor) {
  const parsed = purgeWorkspaceDataSchema.parse(input ?? {});
  const requested = new Set(parsed.types);
  const deleted: Record<string, number> = {};

  for (const statement of purgeStatements) {
    if (!requested.has(statement.type)) continue;
    const result = await context.pool.query(statement.sql, [context.workspaceId]);
    deleted[statement.resultKey] = result.rowCount ?? 0;
  }

  if (!requested.has("audit_events")) {
    await writeAuditEvent(context, {
      ...actor,
      action: "purge workspace data",
      metadata: { types: parsed.types, deleted }
    });
  }

  return { ok: true, types: parsed.types, deleted };
}
