import type { AgentScope } from "@personal-context-os/shared";

export interface ToolDefinition {
  name: string;
  description: string;
  requiredScope: AgentScope;
  inputSchema: Record<string, unknown>;
}

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required
});

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "search_memory",
    description: "Search projects, tasks, notes, documents, reminders, and other entities.",
    requiredScope: "memory:read",
    inputSchema: objectSchema({
      q: { type: "string" },
      entity_type: { type: "string" },
      project_id: { type: "string" },
      status: { type: "string" },
      limit: { type: "number", default: 10 }
    })
  },
  {
    name: "ingest_free_text",
    description: "Capture raw free-form text and normalize it into structured memory.",
    requiredScope: "memory:write",
    inputSchema: objectSchema({ text: { type: "string" }, sourceType: { type: "string", default: "codex" }, projectId: { type: "string" } }, ["text"])
  },
  {
    name: "create_project",
    description: "Create a project.",
    requiredScope: "projects:write",
    inputSchema: objectSchema({ name: { type: "string" }, description: { type: "string" }, priority: { type: "string" } }, ["name"])
  },
  {
    name: "create_task",
    description: "Create a task.",
    requiredScope: "tasks:write",
    inputSchema: objectSchema({ title: { type: "string" }, description: { type: "string" }, projectId: { type: "string" }, priority: { type: "string" }, dueAt: { type: "string" } }, ["title"])
  },
  {
    name: "update_task",
    description: "Update a task.",
    requiredScope: "tasks:write",
    inputSchema: objectSchema({ id: { type: "string" }, title: { type: "string" }, status: { type: "string" }, priority: { type: "string" }, dueAt: { type: "string" } }, ["id"])
  },
  {
    name: "complete_task",
    description: "Mark a task complete.",
    requiredScope: "tasks:write",
    inputSchema: objectSchema({ id: { type: "string" } }, ["id"])
  },
  {
    name: "get_project_context",
    description: "Get a project context pack.",
    requiredScope: "projects:read",
    inputSchema: objectSchema({ projectId: { type: "string" } }, ["projectId"])
  },
  {
    name: "get_daily_dashboard",
    description: "Get today's dashboard.",
    requiredScope: "memory:read",
    inputSchema: objectSchema({})
  },
  {
    name: "get_urgent_tasks",
    description: "List urgent open tasks.",
    requiredScope: "tasks:read",
    inputSchema: objectSchema({ limit: { type: "number", default: 25 } })
  },
  {
    name: "attach_document",
    description: "Attach document metadata or extracted text.",
    requiredScope: "documents:write",
    inputSchema: objectSchema({ title: { type: "string" }, projectId: { type: "string" }, objectKey: { type: "string" }, mimeType: { type: "string" }, extractedText: { type: "string" } }, ["title"])
  },
  {
    name: "link_entities",
    description: "Create a non-destructive relationship between two entities.",
    requiredScope: "memory:write",
    inputSchema: objectSchema({ fromEntityId: { type: "string" }, toEntityId: { type: "string" }, relationType: { type: "string" } }, ["fromEntityId", "toEntityId", "relationType"])
  },
  {
    name: "create_context_pack",
    description: "Create a project context pack.",
    requiredScope: "projects:read",
    inputSchema: objectSchema({ projectId: { type: "string" } }, ["projectId"])
  }
];

export function getToolDefinition(name: string) {
  return toolDefinitions.find((tool) => tool.name === name);
}
