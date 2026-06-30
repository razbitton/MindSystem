import { sql } from "drizzle-orm";
import {
  index,
  boolean,
  integer,
  jsonb,
  numeric,
  date,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  customType
} from "drizzle-orm/pg-core";

export const sourceType = pgEnum("source_type", ["web", "whatsapp", "openclaw", "codex", "api", "manual"]);
export const entityType = pgEnum("entity_type", [
  "project",
  "task",
  "note",
  "document",
  "memory",
  "decision",
  "reminder",
  "person",
  "goal"
]);
export const projectStatus = pgEnum("project_status", ["active", "paused", "completed", "archived"]);
export const taskStatus = pgEnum("task_status", ["inbox", "todo", "in_progress", "waiting", "done", "cancelled"]);
export const taskKind = pgEnum("task_kind", ["one_off", "ongoing"]);
export const priority = pgEnum("priority", ["low", "medium", "high", "urgent"]);
export const dailyObjectiveState = pgEnum("daily_objective_state", ["pinned", "dismissed"]);
export const relationType = pgEnum("relation_type", [
  "belongs_to",
  "depends_on",
  "mentions",
  "blocks",
  "derived_from",
  "related_to"
]);
export const reviewStatus = pgEnum("review_status", ["pending", "approved", "rejected"]);
export const memoryKind = pgEnum("memory_kind", [
  "fact",
  "decision",
  "preference",
  "constraint",
  "commitment",
  "open_question",
  "project_update",
  "person_profile",
  "topic_note"
]);
export const memoryStatus = pgEnum("memory_status", ["active", "superseded", "archived"]);
export const memoryImportance = pgEnum("memory_importance", ["low", "medium", "high", "critical"]);
export const memoryValidity = pgEnum("memory_validity", ["current", "stale", "disputed", "superseded"]);
export const aiAutonomyMode = pgEnum("ai_autonomy_mode", ["conservative", "balanced", "autopilot"]);
export const aiOperationDecision = pgEnum("ai_operation_decision", [
  "auto_apply",
  "auto_apply_with_audit",
  "needs_review",
  "reject_or_ignore"
]);

const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    return value
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .filter(Boolean)
      .map(Number);
  }
});

const tsvector = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return "tsvector";
  }
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true })
}, (table) => ({
  workspaceEmailIdx: uniqueIndex("users_workspace_email_idx").on(table.workspaceId, table.email)
}));

export const googleCalendarConnections = pgTable("google_calendar_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  googleAccountEmail: text("google_account_email"),
  accessTokenCiphertext: text("access_token_ciphertext"),
  refreshTokenCiphertext: text("refresh_token_ciphertext").notNull(),
  tokenType: text("token_type"),
  scope: text("scope").array().notNull().default(sql`ARRAY[]::text[]`),
  expiryDate: timestamp("expiry_date", { withTimezone: true }),
  selectedCalendarIds: text("selected_calendar_ids").array().notNull().default(sql`ARRAY[]::text[]`),
  ...timestamps
}, (table) => ({
  workspaceUserIdx: uniqueIndex("google_calendar_connections_workspace_user_idx").on(table.workspaceId, table.userId)
}));

export const openaiCodexConnections = pgTable("openai_codex_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  accountId: text("account_id").notNull(),
  email: text("email"),
  chatgptPlanType: text("chatgpt_plan_type"),
  accessTokenCiphertext: text("access_token_ciphertext").notNull(),
  refreshTokenCiphertext: text("refresh_token_ciphertext").notNull(),
  expiryDate: timestamp("expiry_date", { withTimezone: true }),
  scope: text("scope").array().notNull().default(sql`ARRAY[]::text[]`),
  ...timestamps
}, (table) => ({
  workspaceIdx: uniqueIndex("openai_codex_connections_workspace_idx").on(table.workspaceId),
  accountIdx: index("openai_codex_connections_account_idx").on(table.accountId)
}));

export const apiClients = pgTable("api_clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  clientId: text("client_id").notNull().unique(),
  clientSecretHash: text("client_secret_hash").notNull(),
  scopes: text("scopes").array().notNull().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true })
});

export const agentTokens = pgTable("agent_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  scopes: text("scopes").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true })
});

export const rawItems = pgTable("raw_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  sourceType: sourceType("source_type").notNull(),
  sourceExternalId: text("source_external_id"),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  rawText: text("raw_text").notNull(),
  rawPayload: jsonb("raw_payload").notNull().default({}),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  contentHash: text("content_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  workspaceCreatedIdx: index("raw_items_workspace_created_idx").on(table.workspaceId, table.createdAt),
  contentHashIdx: index("raw_items_content_hash_idx").on(table.contentHash)
}));

export const entities = pgTable("entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  entityType: entityType("entity_type").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  body: text("body"),
  status: text("status").notNull().default("active"),
  canonical: jsonb("canonical").notNull().default({}),
  customFields: jsonb("custom_fields").notNull().default({}),
  sourceRawItemId: uuid("source_raw_item_id").references(() => rawItems.id, { onDelete: "set null" }),
  confidenceScore: numeric("confidence_score", { precision: 4, scale: 3 }).notNull().default("1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true })
}, (table) => ({
  workspaceTypeTitleIdx: index("entities_workspace_type_title_idx").on(table.workspaceId, table.entityType, table.title),
  workspaceUpdatedIdx: index("entities_workspace_updated_idx").on(table.workspaceId, table.updatedAt)
}));

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityId: uuid("entity_id").notNull().unique().references(() => entities.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  goal: text("goal"),
  color: text("color"),
  status: projectStatus("status").notNull().default("active"),
  priority: priority("priority").notNull().default("medium"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps
}, (table) => ({
  workspaceNameIdx: index("projects_workspace_name_idx").on(table.workspaceId, table.name),
  workspaceStatusIdx: index("projects_workspace_status_idx").on(table.workspaceId, table.status)
}));

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityId: uuid("entity_id").notNull().unique().references(() => entities.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  kind: taskKind("kind").notNull().default("one_off"),
  status: taskStatus("status").notNull().default("todo"),
  priority: priority("priority").notNull().default("medium"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  estimateMinutes: integer("estimate_minutes"),
  assignee: text("assignee"),
  dependsOnTaskId: uuid("depends_on_task_id"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps
}, (table) => ({
  workspaceStatusIdx: index("tasks_workspace_status_idx").on(table.workspaceId, table.status),
  workspaceDueIdx: index("tasks_workspace_due_idx").on(table.workspaceId, table.dueAt),
  projectIdx: index("tasks_project_idx").on(table.projectId)
}));

export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityId: uuid("entity_id").notNull().unique().references(() => entities.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  ...timestamps
}, (table) => ({
  workspaceCreatedIdx: index("notes_workspace_created_idx").on(table.workspaceId, table.createdAt),
  projectIdx: index("notes_project_idx").on(table.projectId)
}));

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityId: uuid("entity_id").notNull().unique().references(() => entities.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  objectKey: text("object_key"),
  mimeType: text("mime_type"),
  extractedText: text("extracted_text"),
  ...timestamps
});

export const reminders = pgTable("reminders", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityId: uuid("entity_id").notNull().unique().references(() => entities.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  remindAt: timestamp("remind_at", { withTimezone: true }),
  recurrenceRule: text("recurrence_rule"),
  status: text("status").notNull().default("scheduled"),
  ...timestamps
});

export const memoryRecords = pgTable("memory_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityId: uuid("entity_id").notNull().unique().references(() => entities.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  sourceRawItemId: uuid("source_raw_item_id").references(() => rawItems.id, { onDelete: "set null" }),
  kind: memoryKind("kind").notNull(),
  status: memoryStatus("status").notNull().default("active"),
  importance: memoryImportance("importance").notNull().default("medium"),
  title: text("title").notNull(),
  summary: text("summary"),
  body: text("body").notNull(),
  confidenceScore: numeric("confidence_score", { precision: 4, scale: 3 }).notNull().default("1"),
  supersedesMemoryId: uuid("supersedes_memory_id"),
  supersededByMemoryId: uuid("superseded_by_memory_id"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  staleAfter: timestamp("stale_after", { withTimezone: true }),
  validity: memoryValidity("validity").notNull().default("current"),
  confidenceReason: text("confidence_reason"),
  sourceReliability: numeric("source_reliability", { precision: 4, scale: 3 }).notNull().default("0.8"),
  customFields: jsonb("custom_fields").notNull().default({}),
  ...timestamps
}, (table) => ({
  workspaceKindUpdatedIdx: index("memory_records_workspace_kind_updated_idx").on(table.workspaceId, table.kind, table.updatedAt),
  workspaceStatusIdx: index("memory_records_workspace_status_idx").on(table.workspaceId, table.status),
  workspaceValidityIdx: index("memory_records_workspace_validity_idx").on(table.workspaceId, table.validity),
  workspaceStaleAfterIdx: index("memory_records_workspace_stale_after_idx").on(table.workspaceId, table.staleAfter),
  projectIdx: index("memory_records_project_idx").on(table.projectId)
}));

export const memorySources = pgTable("memory_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  memoryRecordId: uuid("memory_record_id").notNull().references(() => memoryRecords.id, { onDelete: "cascade" }),
  rawItemId: uuid("raw_item_id").references(() => rawItems.id, { onDelete: "set null" }),
  sourceQuote: text("source_quote"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  memoryIdx: index("memory_sources_memory_idx").on(table.memoryRecordId),
  workspaceIdx: index("memory_sources_workspace_idx").on(table.workspaceId)
}));

export const dailyObjectiveOverrides = pgTable("daily_objective_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  localDate: date("local_date", { mode: "string" }).notNull(),
  state: dailyObjectiveState("state").notNull(),
  ...timestamps
}, (table) => ({
  uniqueTaskDateIdx: uniqueIndex("daily_objective_overrides_unique_idx").on(table.workspaceId, table.taskId, table.localDate),
  workspaceDateIdx: index("daily_objective_overrides_workspace_date_idx").on(table.workspaceId, table.localDate),
  taskIdx: index("daily_objective_overrides_task_idx").on(table.taskId)
}));

export const entityEdges = pgTable("entity_edges", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  fromEntityId: uuid("from_entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  toEntityId: uuid("to_entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  relationType: relationType("relation_type").notNull(),
  confidenceScore: numeric("confidence_score", { precision: 4, scale: 3 }).notNull().default("1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  fromIdx: index("entity_edges_from_idx").on(table.workspaceId, table.fromEntityId),
  toIdx: index("entity_edges_to_idx").on(table.workspaceId, table.toEntityId)
}));

export const entityTags = pgTable("entity_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  entityId: uuid("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  tag: text("tag").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  uniqueTagIdx: uniqueIndex("entity_tags_unique_idx").on(table.workspaceId, table.entityId, table.tag)
}));

export const entityAliases = pgTable("entity_aliases", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  entityId: uuid("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  alias: text("alias").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  uniqueAliasIdx: uniqueIndex("entity_aliases_unique_idx").on(table.workspaceId, table.entityId, table.alias),
  lookupIdx: index("entity_aliases_lookup_idx").on(table.workspaceId, table.alias)
}));

export const chunks = pgTable("chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  entityId: uuid("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  chunkText: text("chunk_text").notNull(),
  chunkIndex: integer("chunk_index").notNull().default(0),
  embedding: vector("embedding", { dimensions: 1536 }),
  fts: tsvector("fts"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  entityIdx: index("chunks_entity_idx").on(table.entityId),
  workspaceIdx: index("chunks_workspace_idx").on(table.workspaceId)
}));

export const schemaDefinitions = pgTable("schema_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  entityType: entityType("entity_type").notNull(),
  name: text("name").notNull(),
  jsonSchema: jsonb("json_schema").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const projectSchemaOverrides = pgTable("project_schema_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  entityType: entityType("entity_type").notNull(),
  jsonSchema: jsonb("json_schema").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const reviewQueue = pgTable("review_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  rawItemId: uuid("raw_item_id").references(() => rawItems.id, { onDelete: "cascade" }),
  entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
  reason: text("reason").notNull(),
  suggestedAction: text("suggested_action").notNull(),
  suggestedPayload: jsonb("suggested_payload").notNull().default({}),
  status: reviewStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, { onDelete: "set null" })
}, (table) => ({
  workspaceStatusIdx: index("review_queue_workspace_status_idx").on(table.workspaceId, table.status)
}));

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
  rawItemId: uuid("raw_item_id").references(() => rawItems.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  workspaceCreatedIdx: index("audit_events_workspace_created_idx").on(table.workspaceId, table.createdAt)
}));

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  agentTokenId: uuid("agent_token_id").references(() => agentTokens.id, { onDelete: "set null" }),
  toolName: text("tool_name").notNull(),
  input: jsonb("input").notNull().default({}),
  outputSummary: text("output_summary"),
  status: text("status").notNull().default("completed"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true })
});

export const retrievalLogs = pgTable("retrieval_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  agentTokenId: uuid("agent_token_id").references(() => agentTokens.id, { onDelete: "set null" }),
  query: text("query").notNull(),
  filters: jsonb("filters").notNull().default({}),
  resultCount: integer("result_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const aiProcessingRuns = pgTable("ai_processing_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  runType: text("run_type").notNull().default("memory_backfill"),
  status: text("status").notNull().default("queued"),
  requestedByUserId: uuid("requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
  sourceTypes: text("source_types").array().notNull().default(sql`ARRAY[]::text[]`),
  rawItemIds: uuid("raw_item_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
  onlyUnprocessed: boolean("only_unprocessed").notNull().default(true),
  dryRun: boolean("dry_run").notNull().default(false),
  limitCount: integer("limit_count").notNull().default(500),
  batchSize: integer("batch_size").notNull().default(25),
  since: timestamp("since", { withTimezone: true }),
  until: timestamp("until", { withTimezone: true }),
  totalCount: integer("total_count").notNull().default(0),
  processedCount: integer("processed_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  createdCount: integer("created_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  error: text("error"),
  selectionSummary: jsonb("selection_summary").notNull().default({}),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps
}, (table) => ({
  workspaceStatusIdx: index("ai_processing_runs_workspace_status_idx").on(table.workspaceId, table.status, table.createdAt)
}));

export const aiProcessingSchedules = pgTable("ai_processing_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  intervalMinutes: integer("interval_minutes").notNull().default(1440),
  sourceTypes: text("source_types").array().notNull().default(sql`ARRAY[]::text[]`),
  onlyUnprocessed: boolean("only_unprocessed").notNull().default(true),
  dryRun: boolean("dry_run").notNull().default(false),
  limitCount: integer("limit_count").notNull().default(100),
  batchSize: integer("batch_size").notNull().default(25),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  ...timestamps
}, (table) => ({
  workspaceIdx: uniqueIndex("ai_processing_schedules_workspace_idx").on(table.workspaceId),
  dueIdx: index("ai_processing_schedules_due_idx").on(table.enabled, table.nextRunAt)
}));

export const aiOperationPolicies = pgTable("ai_operation_policies", {
  workspaceId: uuid("workspace_id").primaryKey().references(() => workspaces.id, { onDelete: "cascade" }),
  mode: aiAutonomyMode("mode").notNull().default("balanced"),
  autoApplyMinConfidence: numeric("auto_apply_min_confidence", { precision: 4, scale: 3 }).notNull().default("0.82"),
  reviewBelowConfidence: numeric("review_below_confidence", { precision: 4, scale: 3 }).notNull().default("0.65"),
  requireReviewForDestructive: boolean("require_review_for_destructive").notNull().default(true),
  requireReviewForSensitive: boolean("require_review_for_sensitive").notNull().default(true),
  requireReviewForConflicts: boolean("require_review_for_conflicts").notNull().default(true),
  requireReviewForBulkChanges: boolean("require_review_for_bulk_changes").notNull().default(true),
  maxAutoApplyBatchSize: integer("max_auto_apply_batch_size").notNull().default(10),
  ...timestamps
});

export const aiActivityLog = pgTable("ai_activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  runId: uuid("run_id"),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id"),
  operationType: text("operation_type").notNull(),
  decision: aiOperationDecision("decision").notNull(),
  reason: text("reason").notNull(),
  rawItemId: uuid("raw_item_id").references(() => rawItems.id, { onDelete: "set null" }),
  entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
  affectedRecords: jsonb("affected_records").notNull().default([]),
  previousValues: jsonb("previous_values").notNull().default({}),
  newValues: jsonb("new_values").notNull().default({}),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  sourceReliability: numeric("source_reliability", { precision: 4, scale: 3 }),
  input: jsonb("input").notNull().default({}),
  undoStatus: text("undo_status").notNull().default("not_available"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  workspaceCreatedIdx: index("ai_activity_log_workspace_created_idx").on(table.workspaceId, table.createdAt),
  workspaceDecisionIdx: index("ai_activity_log_workspace_decision_idx").on(table.workspaceId, table.decision)
}));
