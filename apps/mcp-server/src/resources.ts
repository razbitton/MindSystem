import { agentMemoryBootstrapInstructions, agentMemoryPolicyText, type AgentScope } from "@personal-context-os/shared";

export interface ResourceDefinition {
  uri: string;
  name: string;
  mimeType: string;
  requiredScope: AgentScope;
  matches: (uri: string) => boolean;
  buildPath?: (uri: string) => string;
  staticText?: string;
  extractText?: (data: unknown) => string;
}

const exactResource = (
  uri: string,
  name: string,
  requiredScope: AgentScope,
  path: string,
  options: { mimeType?: string; extractText?: (data: unknown) => string } = {}
): ResourceDefinition => {
  const resource: ResourceDefinition = {
    uri,
    name,
    mimeType: options.mimeType ?? "application/json",
    requiredScope,
    matches: (candidate) => candidate === uri,
    buildPath: () => path
  };
  if (options.extractText) resource.extractText = options.extractText;
  return resource;
};

const idResource = (uri: string, name: string, requiredScope: AgentScope, prefix: string, pathPrefix: string): ResourceDefinition => ({
  uri,
  name,
  mimeType: "application/json",
  requiredScope,
  matches: (candidate) => candidate.startsWith(prefix),
  buildPath: (candidate) => `${pathPrefix}/${candidate.slice(prefix.length)}`
});

const staticResource = (uri: string, name: string, requiredScope: AgentScope, text: string): ResourceDefinition => ({
  uri,
  name,
  mimeType: "text/markdown",
  requiredScope,
  matches: (candidate) => candidate === uri,
  staticText: text
});

export const memoryPolicyText = agentMemoryPolicyText;
export const agentBootstrapText = agentMemoryBootstrapInstructions;

export const resourceDefinitions: ResourceDefinition[] = [
  staticResource("agent-bootstrap://memory", "Agent bootstrap instructions", "memory:read", agentBootstrapText),
  staticResource("memory-policy://agent", "Agent memory workflow policy", "memory:read", memoryPolicyText),
  exactResource("dashboard://today", "Today's dashboard", "memory:read", "/api/dashboard/today", {
    mimeType: "text/markdown",
    extractText: compactDashboardText
  }),
  exactResource("raw-items://recent", "Recent raw captures", "memory:read", "/api/raw-items?limit=10", {
    mimeType: "text/markdown",
    extractText: compactRawItemsText
  }),
  exactResource("entities://all", "All entities", "memory:read", "/api/entities"),
  exactResource("projects://all", "All projects", "projects:read", "/api/projects"),
  exactResource("tasks://all", "All tasks", "tasks:read", "/api/tasks"),
  exactResource("notes://all", "All notes", "memory:read", "/api/notes"),
  exactResource("documents://all", "All documents", "documents:read", "/api/documents"),
  exactResource("reminders://all", "All reminders", "memory:read", "/api/reminders"),
  exactResource("review-queue://pending", "Pending memory exceptions", "admin", "/api/review-queue"),
  exactResource("audit-events://recent", "Recent audit events", "admin", "/api/audit-events"),
  exactResource("retrieval-logs://recent", "Recent retrieval logs", "admin", "/api/retrieval-logs"),
  exactResource("schema-definitions://all", "Schema definitions", "admin", "/api/schema-definitions"),
  exactResource("project-schema-overrides://all", "Project schema overrides", "admin", "/api/project-schema-overrides"),
  exactResource("data-inventory://workspace", "Workspace data inventory", "admin", "/api/admin/data-inventory"),
  idResource("raw-item://{rawItemId}", "Raw capture by id", "memory:read", "raw-item://", "/api/raw-items"),
  idResource("memory://{memoryId}", "Memory record by id", "memory:read", "memory://", "/api/memory"),
  idResource("entity://{entityId}", "Entity by id", "memory:read", "entity://", "/api/entities"),
  idResource("project://{projectId}", "Project by id", "projects:read", "project://", "/api/projects"),
  idResource("task://{taskId}", "Task by id", "tasks:read", "task://", "/api/tasks"),
  idResource("note://{noteId}", "Note by id", "memory:read", "note://", "/api/notes"),
  idResource("document://{documentId}", "Document by id", "documents:read", "document://", "/api/documents"),
  idResource("reminder://{reminderId}", "Reminder by id", "memory:read", "reminder://", "/api/reminders"),
  {
    uri: "context-pack://project/{projectId}",
    name: "Project context pack",
    mimeType: "text/markdown",
    requiredScope: "projects:read",
    matches: (candidate) => candidate.startsWith("context-pack://project/"),
    buildPath: (candidate) => `/api/projects/${candidate.slice("context-pack://project/".length)}/context`,
    extractText: (data) => {
      if (isRecord(data) && typeof data.contextPack === "string") return data.contextPack;
      return JSON.stringify(data, null, 2);
    }
  }
];

export const listedResources = resourceDefinitions.map(({ requiredScope, matches, buildPath, staticText, extractText, ...resource }) => resource);

export function getResourceDefinition(uri: string) {
  return resourceDefinitions.find((resource) => resource.matches(uri));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compactDashboardText(data: unknown) {
  if (!isRecord(data)) return JSON.stringify(data, null, 2);
  const lines = [
    "# Today's Dashboard",
    "",
    `Date: ${stringValue(data.dashboardDate) ?? "unknown"}`,
    `Review queue: ${numberValue(data.reviewQueueCount) ?? 0}`,
    ""
  ];
  appendItems(lines, "Daily Objectives", arrayValue(data.dailyObjectives), taskLine);
  appendItems(lines, "Urgent Tasks", arrayValue(data.urgentTasks), taskLine);
  appendItems(lines, "Overdue Tasks", arrayValue(data.overdueTasks), taskLine);
  appendItems(lines, "Active Projects", arrayValue(data.activeProjects), projectLine);
  appendItems(lines, "Recent Captures", arrayValue(data.recentCapturedItems), rawItemLine);
  return lines.join("\n");
}

function compactRawItemsText(data: unknown) {
  if (!isRecord(data)) return JSON.stringify(data, null, 2);
  const lines = ["# Recent Raw Captures", ""];
  appendItems(lines, "Items", arrayValue(data.rawItems), rawItemLine);
  return lines.join("\n");
}

function appendItems(lines: string[], title: string, items: unknown[], format: (item: Record<string, unknown>) => string) {
  lines.push(`## ${title}`);
  if (!items.length) {
    lines.push("- None", "");
    return;
  }
  for (const item of items.slice(0, 10)) {
    lines.push(format(isRecord(item) ? item : { value: item }));
  }
  lines.push("");
}

function taskLine(item: Record<string, unknown>) {
  const id = stringValue(item.id) ?? stringValue(item.taskId) ?? "";
  const title = stringValue(item.title) ?? "Untitled task";
  const status = stringValue(item.status) ?? "unknown";
  const priority = stringValue(item.priority) ?? "medium";
  const project = stringValue(item.project_name) ?? stringValue(item.projectName);
  return `- ${title}${project ? ` (${project})` : ""} - ${status}, ${priority}${id ? ` [task://${id}]` : ""}`;
}

function projectLine(item: Record<string, unknown>) {
  const id = stringValue(item.id) ?? "";
  const name = stringValue(item.name) ?? stringValue(item.title) ?? "Untitled project";
  const status = stringValue(item.status) ?? "unknown";
  return `- ${name} - ${status}${id ? ` [project://${id}]` : ""}`;
}

function rawItemLine(item: Record<string, unknown>) {
  const id = stringValue(item.id) ?? "";
  const sourceType = stringValue(item.source_type) ?? stringValue(item.sourceType) ?? "unknown";
  const createdAt = stringValue(item.created_at) ?? stringValue(item.createdAt);
  const text = truncate(stringValue(item.raw_text) ?? stringValue(item.rawText) ?? "", 180);
  return `- ${sourceType}${createdAt ? ` ${createdAt}` : ""}${id ? ` [raw-item://${id}]` : ""}${text ? `: ${text}` : ""}`;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function truncate(value: string, maxLength: number) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 3)}...` : trimmed;
}
