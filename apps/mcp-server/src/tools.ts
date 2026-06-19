import { agentScopeValues, type AgentScope } from "@personal-context-os/shared";

export type ToolHttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface ToolDefinition {
  name: string;
  description: string;
  requiredScope: AgentScope;
  inputSchema: Record<string, unknown>;
}

export interface RestToolDefinition extends ToolDefinition {
  method: ToolHttpMethod;
  path: string | ((args: Record<string, unknown>) => string);
  query?: (args: Record<string, unknown>) => Record<string, unknown>;
  body?: (args: Record<string, unknown>) => Record<string, unknown>;
}

export interface RestToolRequest {
  method: ToolHttpMethod;
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required
});

const idSchema = (description: string) => ({ type: "string", description });
const nullableStringSchema = (description?: string) => ({ type: ["string", "null"], ...(description ? { description } : {}) });
const dateTimeSchema = (description = "ISO 8601 datetime.") => ({ type: "string", description });

const taskStatusValues = ["inbox", "todo", "in_progress", "waiting", "done", "cancelled"];
const projectStatusValues = ["active", "paused", "completed", "archived"];
const priorityValues = ["low", "medium", "high", "urgent"];

const projectProperties = {
  name: { type: "string" },
  description: { type: "string" },
  goal: { type: "string" },
  status: { type: "string", enum: projectStatusValues, default: "active" },
  priority: { type: "string", enum: priorityValues, default: "medium" },
  dueAt: dateTimeSchema()
};

const taskProperties = {
  title: {
    type: "string",
    description: "Clean human-readable task title. Do not prefix metadata such as [owner] or [status]."
  },
  description: { type: "string" },
  projectId: nullableStringSchema("Project table id, not project entity id."),
  status: { type: "string", enum: taskStatusValues, default: "todo" },
  priority: { type: "string", enum: priorityValues, default: "medium" },
  dueAt: nullableStringSchema("ISO 8601 datetime."),
  scheduledFor: nullableStringSchema("ISO 8601 datetime."),
  estimateMinutes: { type: ["number", "null"] },
  assignee: nullableStringSchema("Owner or assignee name."),
  dependsOnTaskId: nullableStringSchema("Task table id for a dependency.")
};

const noteProperties = {
  title: { type: "string" },
  body: { type: "string" },
  projectId: nullableStringSchema("Project table id.")
};

const documentProperties = {
  title: { type: "string" },
  projectId: nullableStringSchema("Project table id."),
  objectKey: { type: "string" },
  mimeType: { type: "string" },
  extractedText: { type: "string" }
};

const taskFilterProperties = {
  status: { type: "string", enum: taskStatusValues },
  project_id: { type: "string", description: "Project table id." },
  priority: { type: "string", enum: priorityValues },
  due_before: dateTimeSchema("Return tasks due on or before this ISO 8601 datetime.")
};

const noteFilterProperties = {
  project_id: { type: "string", description: "Project table id." }
};

const withoutKeys = (args: Record<string, unknown>, keys: string[]) => {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (!keys.includes(key)) body[key] = value;
  }
  return body;
};

const idPath = (basePath: string) => (args: Record<string, unknown>) => `${basePath}/${String(args.id)}`;
const projectContextPath = (args: Record<string, unknown>) => `/api/projects/${String(args.projectId)}/context`;
const omitIdBody = (args: Record<string, unknown>) => withoutKeys(args, ["id"]);
const emptyBody = () => ({});

// MCP tools intentionally mirror concrete REST routes. Keep this table aligned with
// apps/api/src/routes.ts and packages/shared/src/openapi.ts so tool parity is visible.
export const mcpRestTools: RestToolDefinition[] = [
  {
    name: "search_memory",
    description: "Search projects, tasks, notes, documents, reminders, and other entities. Results include entityId plus typedId/taskId/projectId fields when available.",
    requiredScope: "memory:read",
    method: "GET",
    path: "/api/search",
    inputSchema: objectSchema({
      q: { type: "string" },
      entity_type: { type: "string" },
      project_id: { type: "string" },
      status: { type: "string" },
      due_before: dateTimeSchema("Return items due on or before this ISO 8601 datetime."),
      limit: { type: "number", default: 10 }
    })
  },
  {
    name: "ingest_free_text",
    description: "Capture raw free-form text and normalize it into structured memory.",
    requiredScope: "memory:write",
    method: "POST",
    path: "/api/ingest/free-text",
    body: (args) => ({ sourceType: "codex", ...args }),
    inputSchema: objectSchema({ text: { type: "string" }, sourceType: { type: "string", default: "codex" }, projectId: { type: "string" } }, ["text"])
  },
  {
    name: "list_projects",
    description: "List projects.",
    requiredScope: "projects:read",
    method: "GET",
    path: "/api/projects",
    inputSchema: objectSchema({})
  },
  {
    name: "create_project",
    description: "Create a project.",
    requiredScope: "projects:write",
    method: "POST",
    path: "/api/projects",
    inputSchema: objectSchema(projectProperties, ["name"])
  },
  {
    name: "get_project",
    description: "Get a project by id.",
    requiredScope: "projects:read",
    method: "GET",
    path: idPath("/api/projects"),
    inputSchema: objectSchema({ id: idSchema("Project table id.") }, ["id"])
  },
  {
    name: "update_project",
    description: "Update a project.",
    requiredScope: "projects:write",
    method: "PATCH",
    path: idPath("/api/projects"),
    body: omitIdBody,
    inputSchema: objectSchema({ id: idSchema("Project table id."), ...projectProperties }, ["id"])
  },
  {
    name: "delete_project",
    description: "Delete a project.",
    requiredScope: "projects:write",
    method: "DELETE",
    path: idPath("/api/projects"),
    inputSchema: objectSchema({ id: idSchema("Project table id.") }, ["id"])
  },
  {
    name: "archive_project",
    description: "Archive a project without deleting it.",
    requiredScope: "projects:write",
    method: "PATCH",
    path: idPath("/api/projects"),
    body: () => ({ status: "archived" }),
    inputSchema: objectSchema({ id: idSchema("Project table id.") }, ["id"])
  },
  {
    name: "list_tasks",
    description: "List tasks with REST-supported filters.",
    requiredScope: "tasks:read",
    method: "GET",
    path: "/api/tasks",
    inputSchema: objectSchema(taskFilterProperties)
  },
  {
    name: "create_task",
    description: "Create a task.",
    requiredScope: "tasks:write",
    method: "POST",
    path: "/api/tasks",
    inputSchema: objectSchema(taskProperties, ["title"])
  },
  {
    name: "get_task",
    description: "Get a task by id.",
    requiredScope: "tasks:read",
    method: "GET",
    path: idPath("/api/tasks"),
    inputSchema: objectSchema({ id: idSchema("Task table id. entityId is accepted by the REST API for compatibility.") }, ["id"])
  },
  {
    name: "update_task",
    description: "Update a task. The id accepts task.id; entityId from search results is also accepted for compatibility. Prefer taskId when present.",
    requiredScope: "tasks:write",
    method: "PATCH",
    path: idPath("/api/tasks"),
    body: omitIdBody,
    inputSchema: objectSchema({
      id: idSchema("Task table id. entityId is accepted for compatibility; prefer taskId from search_memory."),
      ...taskProperties
    }, ["id"])
  },
  {
    name: "delete_task",
    description: "Delete a task.",
    requiredScope: "tasks:write",
    method: "DELETE",
    path: idPath("/api/tasks"),
    inputSchema: objectSchema({ id: idSchema("Task table id. entityId is accepted by the REST API for compatibility.") }, ["id"])
  },
  {
    name: "complete_task",
    description: "Mark a task complete.",
    requiredScope: "tasks:write",
    method: "POST",
    path: (args) => `/api/tasks/${String(args.id)}/complete`,
    body: emptyBody,
    inputSchema: objectSchema({ id: idSchema("Task table id. entityId is accepted for compatibility; prefer taskId from search_memory.") }, ["id"])
  },
  {
    name: "cancel_task",
    description: "Cancel a task without deleting it.",
    requiredScope: "tasks:write",
    method: "PATCH",
    path: idPath("/api/tasks"),
    body: () => ({ status: "cancelled" }),
    inputSchema: objectSchema({ id: idSchema("Task table id. entityId is accepted by the REST API for compatibility.") }, ["id"])
  },
  {
    name: "list_notes",
    description: "List notes with REST-supported filters.",
    requiredScope: "memory:read",
    method: "GET",
    path: "/api/notes",
    inputSchema: objectSchema(noteFilterProperties)
  },
  {
    name: "create_note",
    description: "Create a note.",
    requiredScope: "memory:write",
    method: "POST",
    path: "/api/notes",
    inputSchema: objectSchema(noteProperties, ["title", "body"])
  },
  {
    name: "get_note",
    description: "Get a note by id.",
    requiredScope: "memory:read",
    method: "GET",
    path: idPath("/api/notes"),
    inputSchema: objectSchema({ id: idSchema("Note table id.") }, ["id"])
  },
  {
    name: "update_note",
    description: "Update a note.",
    requiredScope: "memory:write",
    method: "PATCH",
    path: idPath("/api/notes"),
    body: omitIdBody,
    inputSchema: objectSchema({ id: idSchema("Note table id."), ...noteProperties }, ["id"])
  },
  {
    name: "delete_note",
    description: "Delete a note.",
    requiredScope: "memory:write",
    method: "DELETE",
    path: idPath("/api/notes"),
    inputSchema: objectSchema({ id: idSchema("Note table id.") }, ["id"])
  },
  {
    name: "list_documents",
    description: "List documents.",
    requiredScope: "documents:read",
    method: "GET",
    path: "/api/documents",
    inputSchema: objectSchema({})
  },
  {
    name: "attach_document",
    description: "Attach document metadata or extracted text.",
    requiredScope: "documents:write",
    method: "POST",
    path: "/api/documents",
    inputSchema: objectSchema(documentProperties, ["title"])
  },
  {
    name: "get_document",
    description: "Get a document by id.",
    requiredScope: "documents:read",
    method: "GET",
    path: idPath("/api/documents"),
    inputSchema: objectSchema({ id: idSchema("Document table id.") }, ["id"])
  },
  {
    name: "get_project_context",
    description: "Get a project context pack.",
    requiredScope: "projects:read",
    method: "GET",
    path: projectContextPath,
    inputSchema: objectSchema({ projectId: { type: "string" } }, ["projectId"])
  },
  {
    name: "create_context_pack",
    description: "Create a project context pack.",
    requiredScope: "projects:read",
    method: "GET",
    path: projectContextPath,
    inputSchema: objectSchema({ projectId: { type: "string" } }, ["projectId"])
  },
  {
    name: "get_daily_dashboard",
    description: "Get today's dashboard.",
    requiredScope: "memory:read",
    method: "GET",
    path: "/api/dashboard/today",
    inputSchema: objectSchema({})
  },
  {
    name: "get_urgent_tasks",
    description: "List urgent open tasks.",
    requiredScope: "tasks:read",
    method: "GET",
    path: "/api/tasks",
    query: (args) => ({ priority: "urgent", limit: args.limit ?? 25 }),
    inputSchema: objectSchema({ limit: { type: "number", default: 25 } })
  },
  {
    name: "list_review_queue",
    description: "List pending review queue items.",
    requiredScope: "admin",
    method: "GET",
    path: "/api/review-queue",
    inputSchema: objectSchema({})
  },
  {
    name: "approve_review_item",
    description: "Approve a review queue item.",
    requiredScope: "admin",
    method: "POST",
    path: (args) => `/api/review-queue/${String(args.id)}/approve`,
    body: omitIdBody,
    inputSchema: objectSchema({
      id: idSchema("Review queue item id."),
      editedPayload: { type: "object", description: "Optional edited payload to apply instead of the suggested payload." }
    }, ["id"])
  },
  {
    name: "reject_review_item",
    description: "Reject a review queue item.",
    requiredScope: "admin",
    method: "POST",
    path: (args) => `/api/review-queue/${String(args.id)}/reject`,
    body: emptyBody,
    inputSchema: objectSchema({ id: idSchema("Review queue item id.") }, ["id"])
  },
  {
    name: "list_agents",
    description: "List agent tokens and recent agent activity.",
    requiredScope: "admin",
    method: "GET",
    path: "/api/agents",
    inputSchema: objectSchema({})
  },
  {
    name: "create_agent_token",
    description: "Create a scoped agent token. The plaintext token is returned once.",
    requiredScope: "admin",
    method: "POST",
    path: "/api/agents/tokens",
    inputSchema: objectSchema({
      name: { type: "string" },
      scopes: { type: "array", items: { type: "string", enum: agentScopeValues } },
      expiresAt: nullableStringSchema("ISO 8601 datetime or null.")
    }, ["name", "scopes"])
  },
  {
    name: "list_audit_events",
    description: "List recent audit events.",
    requiredScope: "admin",
    method: "GET",
    path: "/api/audit-events",
    inputSchema: objectSchema({})
  }
];

export const directToolDefinitions: ToolDefinition[] = [
  {
    name: "link_entities",
    description: "Create a non-destructive relationship between two entities.",
    requiredScope: "memory:write",
    inputSchema: objectSchema({ fromEntityId: { type: "string" }, toEntityId: { type: "string" }, relationType: { type: "string" } }, ["fromEntityId", "toEntityId", "relationType"])
  }
];

export const toolDefinitions: ToolDefinition[] = [...mcpRestTools, ...directToolDefinitions].map(({ name, description, requiredScope, inputSchema }) => ({
  name,
  description,
  requiredScope,
  inputSchema
}));

export function getToolDefinition(name: string) {
  return toolDefinitions.find((tool) => tool.name === name);
}

export function getRestToolDefinition(name: string) {
  return mcpRestTools.find((tool) => tool.name === name);
}

export function buildRestToolRequest(name: string, args: Record<string, unknown>): RestToolRequest | null {
  const tool = getRestToolDefinition(name);
  if (!tool) return null;

  let path: string;
  let pathIsStatic = false;
  if (typeof tool.path === "string") {
    path = tool.path;
    pathIsStatic = true;
  } else {
    path = tool.path(args);
  }
  const request: RestToolRequest = { method: tool.method, path };

  if (tool.method === "GET") {
    request.query = tool.query ? tool.query(args) : pathIsStatic ? args : {};
  } else if (tool.method === "POST" || tool.method === "PATCH") {
    request.body = tool.body ? tool.body(args) : args;
  }

  return request;
}
