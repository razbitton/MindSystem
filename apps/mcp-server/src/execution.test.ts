import { describe, expect, it } from "vitest";
import type { AgentIdentity } from "./auth.js";
import { executeTool, readResource, type McpExecutionRuntime } from "./execution.js";

interface FetchCall {
  url: string;
  method: string;
  authorization: string | null;
  body?: unknown;
}

interface RouteCase {
  name: string;
  args: Record<string, unknown>;
  method: string;
  path: string;
  body?: unknown;
  query?: Record<string, string>;
}

const adminAgent: AgentIdentity = {
  id: "agent-id",
  workspaceId: "workspace-id",
  name: "Admin agent",
  scopes: ["admin"]
};

function createRuntime(responsePayload: unknown = { ok: true }) {
  const calls: FetchCall[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const headers = init?.headers as Record<string, string> | undefined;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({
      url: input instanceof URL ? input.toString() : typeof input === "string" ? input : input.url,
      method: init?.method ?? "GET",
      authorization: headers?.authorization ?? null,
      ...(body !== undefined ? { body } : {})
    });

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const runtime: McpExecutionRuntime = {
    db: {} as McpExecutionRuntime["db"],
    apiBaseUrl: "http://api.test",
    fetchFn
  };

  return { runtime, calls };
}

const routeCases: RouteCase[] = [
  {
    name: "list_raw_items",
    args: { source_type: "manual", limit: 5 },
    method: "GET",
    path: "/api/raw-items",
    query: { source_type: "manual", limit: "5" }
  },
  { name: "get_raw_item", args: { id: "raw-id" }, method: "GET", path: "/api/raw-items/raw-id" },
  {
    name: "delete_raw_item",
    args: { id: "raw-id", deleteDerivedEntities: true },
    method: "POST",
    path: "/api/raw-items/raw-id/delete",
    body: { deleteDerivedEntities: true }
  },
  {
    name: "clear_raw_items",
    args: { deleteDerivedEntities: true },
    method: "POST",
    path: "/api/raw-items/clear",
    body: { deleteDerivedEntities: true }
  },
  {
    name: "list_entities",
    args: { entity_type: "decision", limit: 10 },
    method: "GET",
    path: "/api/entities",
    query: { entity_type: "decision", limit: "10" }
  },
  { name: "get_entity", args: { id: "entity-id" }, method: "GET", path: "/api/entities/entity-id" },
  { name: "delete_entity", args: { id: "entity-id" }, method: "DELETE", path: "/api/entities/entity-id" },
  { name: "list_projects", args: {}, method: "GET", path: "/api/projects" },
  { name: "create_project", args: { name: "Project" }, method: "POST", path: "/api/projects", body: { name: "Project" } },
  { name: "get_project", args: { id: "project-id" }, method: "GET", path: "/api/projects/project-id" },
  { name: "update_project", args: { id: "project-id", name: "Renamed" }, method: "PATCH", path: "/api/projects/project-id", body: { name: "Renamed" } },
  { name: "delete_project", args: { id: "project-id" }, method: "DELETE", path: "/api/projects/project-id" },
  { name: "archive_project", args: { id: "project-id" }, method: "PATCH", path: "/api/projects/project-id", body: { status: "archived" } },
  {
    name: "list_tasks",
    args: { project_id: "project-id", status: "todo", priority: "urgent", due_before: "2026-07-01T00:00:00.000Z" },
    method: "GET",
    path: "/api/tasks",
    query: { project_id: "project-id", status: "todo", priority: "urgent", due_before: "2026-07-01T00:00:00.000Z" }
  },
  { name: "create_task", args: { title: "Task" }, method: "POST", path: "/api/tasks", body: { title: "Task" } },
  { name: "get_task", args: { id: "task-id" }, method: "GET", path: "/api/tasks/task-id" },
  { name: "update_task", args: { id: "task-id", status: "waiting" }, method: "PATCH", path: "/api/tasks/task-id", body: { status: "waiting" } },
  { name: "delete_task", args: { id: "task-id" }, method: "DELETE", path: "/api/tasks/task-id" },
  { name: "complete_task", args: { id: "task-id" }, method: "POST", path: "/api/tasks/task-id/complete", body: {} },
  { name: "cancel_task", args: { id: "task-id" }, method: "PATCH", path: "/api/tasks/task-id", body: { status: "cancelled" } },
  { name: "list_notes", args: { project_id: "project-id" }, method: "GET", path: "/api/notes", query: { project_id: "project-id" } },
  { name: "create_note", args: { title: "Note", body: "Body" }, method: "POST", path: "/api/notes", body: { title: "Note", body: "Body" } },
  { name: "get_note", args: { id: "note-id" }, method: "GET", path: "/api/notes/note-id" },
  { name: "update_note", args: { id: "note-id", body: "Updated" }, method: "PATCH", path: "/api/notes/note-id", body: { body: "Updated" } },
  { name: "delete_note", args: { id: "note-id" }, method: "DELETE", path: "/api/notes/note-id" },
  { name: "list_documents", args: {}, method: "GET", path: "/api/documents" },
  { name: "attach_document", args: { title: "Doc" }, method: "POST", path: "/api/documents", body: { title: "Doc" } },
  { name: "get_document", args: { id: "document-id" }, method: "GET", path: "/api/documents/document-id" },
  { name: "update_document", args: { id: "document-id", title: "Doc 2" }, method: "PATCH", path: "/api/documents/document-id", body: { title: "Doc 2" } },
  { name: "delete_document", args: { id: "document-id" }, method: "DELETE", path: "/api/documents/document-id" },
  {
    name: "list_reminders",
    args: { status: "scheduled", limit: 5 },
    method: "GET",
    path: "/api/reminders",
    query: { status: "scheduled", limit: "5" }
  },
  { name: "create_reminder", args: { title: "Reminder" }, method: "POST", path: "/api/reminders", body: { title: "Reminder" } },
  { name: "get_reminder", args: { id: "reminder-id" }, method: "GET", path: "/api/reminders/reminder-id" },
  { name: "update_reminder", args: { id: "reminder-id", status: "done" }, method: "PATCH", path: "/api/reminders/reminder-id", body: { status: "done" } },
  { name: "delete_reminder", args: { id: "reminder-id" }, method: "DELETE", path: "/api/reminders/reminder-id" },
  { name: "get_project_context", args: { projectId: "project-id" }, method: "GET", path: "/api/projects/project-id/context" },
  { name: "create_context_pack", args: { projectId: "project-id" }, method: "GET", path: "/api/projects/project-id/context" },
  { name: "get_daily_dashboard", args: {}, method: "GET", path: "/api/dashboard/today" },
  { name: "get_urgent_tasks", args: { limit: 10 }, method: "GET", path: "/api/tasks", query: { priority: "urgent", limit: "10" } },
  { name: "list_review_queue", args: { status: "all" }, method: "GET", path: "/api/review-queue", query: { status: "all" } },
  {
    name: "approve_review_item",
    args: { id: "review-id", editedPayload: { title: "Edited" } },
    method: "POST",
    path: "/api/review-queue/review-id/approve",
    body: { editedPayload: { title: "Edited" } }
  },
  { name: "reject_review_item", args: { id: "review-id" }, method: "POST", path: "/api/review-queue/review-id/reject", body: {} },
  { name: "delete_review_item", args: { id: "review-id" }, method: "DELETE", path: "/api/review-queue/review-id" },
  { name: "clear_review_queue", args: {}, method: "POST", path: "/api/review-queue/clear", body: {} },
  { name: "delete_agent_run", args: { id: "run-id" }, method: "DELETE", path: "/api/agents/runs/run-id" },
  { name: "clear_agent_runs", args: {}, method: "POST", path: "/api/agents/runs/clear", body: {} },
  { name: "list_audit_events", args: {}, method: "GET", path: "/api/audit-events" },
  { name: "delete_audit_event", args: { id: "audit-id" }, method: "DELETE", path: "/api/audit-events/audit-id" },
  { name: "clear_audit_events", args: {}, method: "POST", path: "/api/audit-events/clear", body: {} },
  { name: "list_retrieval_logs", args: { limit: 5 }, method: "GET", path: "/api/retrieval-logs", query: { limit: "5" } },
  { name: "delete_retrieval_log", args: { id: "retrieval-id" }, method: "DELETE", path: "/api/retrieval-logs/retrieval-id" },
  { name: "clear_retrieval_logs", args: {}, method: "POST", path: "/api/retrieval-logs/clear", body: {} },
  { name: "list_schema_definitions", args: {}, method: "GET", path: "/api/schema-definitions" },
  { name: "delete_schema_definition", args: { id: "schema-id" }, method: "DELETE", path: "/api/schema-definitions/schema-id" },
  { name: "clear_schema_definitions", args: {}, method: "POST", path: "/api/schema-definitions/clear", body: {} },
  { name: "list_project_schema_overrides", args: {}, method: "GET", path: "/api/project-schema-overrides" },
  {
    name: "delete_project_schema_override",
    args: { id: "override-id" },
    method: "DELETE",
    path: "/api/project-schema-overrides/override-id"
  },
  { name: "clear_project_schema_overrides", args: {}, method: "POST", path: "/api/project-schema-overrides/clear", body: {} },
  { name: "get_data_inventory", args: {}, method: "GET", path: "/api/admin/data-inventory" },
  {
    name: "purge_workspace_data",
    args: { types: ["raw_items", "entities"] },
    method: "POST",
    path: "/api/admin/purge-data",
    body: { types: ["raw_items", "entities"] }
  }
];

describe("MCP REST execution", () => {
  it.each(routeCases)("$name calls the expected REST route", async ({ name, args, method, path, body, query }) => {
    const { runtime, calls } = createRuntime();

    await executeTool(runtime, adminAgent, "pcos_token", name, args);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("Expected one fetch call");
    const url = new URL(call.url);

    expect(call.method).toBe(method);
    expect(call.authorization).toBe("Bearer pcos_token");
    expect(url.pathname).toBe(path);
    expect(call.body).toEqual(body);

    for (const [key, value] of Object.entries(query ?? {})) {
      expect(url.searchParams.get(key)).toBe(value);
    }
  });
});

const resourceCases = [
  { uri: "raw-items://recent", path: "/api/raw-items", scope: "memory:read" },
  { uri: "raw-item://raw-id", path: "/api/raw-items/raw-id", scope: "memory:read" },
  { uri: "entities://all", path: "/api/entities", scope: "memory:read" },
  { uri: "entity://entity-id", path: "/api/entities/entity-id", scope: "memory:read" },
  { uri: "projects://all", path: "/api/projects", scope: "projects:read" },
  { uri: "project://project-id", path: "/api/projects/project-id", scope: "projects:read" },
  { uri: "tasks://all", path: "/api/tasks", scope: "tasks:read" },
  { uri: "task://task-id", path: "/api/tasks/task-id", scope: "tasks:read" },
  { uri: "notes://all", path: "/api/notes", scope: "memory:read" },
  { uri: "note://note-id", path: "/api/notes/note-id", scope: "memory:read" },
  { uri: "documents://all", path: "/api/documents", scope: "documents:read" },
  { uri: "document://document-id", path: "/api/documents/document-id", scope: "documents:read" },
  { uri: "reminders://all", path: "/api/reminders", scope: "memory:read" },
  { uri: "reminder://reminder-id", path: "/api/reminders/reminder-id", scope: "memory:read" },
  { uri: "review-queue://pending", path: "/api/review-queue", scope: "admin" },
  { uri: "audit-events://recent", path: "/api/audit-events", scope: "admin" },
  { uri: "retrieval-logs://recent", path: "/api/retrieval-logs", scope: "admin" },
  { uri: "schema-definitions://all", path: "/api/schema-definitions", scope: "admin" },
  { uri: "project-schema-overrides://all", path: "/api/project-schema-overrides", scope: "admin" },
  { uri: "data-inventory://workspace", path: "/api/admin/data-inventory", scope: "admin" }
] as const;

describe("MCP resources", () => {
  it.each(resourceCases)("reads $uri through the expected scoped REST route", async ({ uri, path, scope }) => {
    const { runtime, calls } = createRuntime();
    const agent: AgentIdentity = { ...adminAgent, scopes: [scope] };

    await readResource(runtime, agent, "pcos_token", uri);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("Expected one fetch call");
    expect(new URL(call.url).pathname).toBe(path);
  });

  it("returns context pack resources as markdown text", async () => {
    const { runtime } = createRuntime({ contextPack: "# Project\n\nContext" });
    const result = await readResource(runtime, { ...adminAgent, scopes: ["projects:read"] }, "pcos_token", "context-pack://project/project-id");

    expect(result).toBe("# Project\n\nContext");
  });

  it("enforces admin scope for admin-only resources", async () => {
    const { runtime } = createRuntime();

    await expect(
      readResource(runtime, { ...adminAgent, scopes: ["memory:read"] }, "pcos_token", "audit-events://recent")
    ).rejects.toThrow("Missing required scope: admin");
  });
});
