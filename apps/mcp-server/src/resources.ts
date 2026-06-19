import type { AgentScope } from "@personal-context-os/shared";

export interface ResourceDefinition {
  uri: string;
  name: string;
  mimeType: string;
  requiredScope: AgentScope;
  matches: (uri: string) => boolean;
  buildPath: (uri: string) => string;
  extractText?: (data: unknown) => string;
}

const exactResource = (uri: string, name: string, requiredScope: AgentScope, path: string): ResourceDefinition => ({
  uri,
  name,
  mimeType: "application/json",
  requiredScope,
  matches: (candidate) => candidate === uri,
  buildPath: () => path
});

const idResource = (uri: string, name: string, requiredScope: AgentScope, prefix: string, pathPrefix: string): ResourceDefinition => ({
  uri,
  name,
  mimeType: "application/json",
  requiredScope,
  matches: (candidate) => candidate.startsWith(prefix),
  buildPath: (candidate) => `${pathPrefix}/${candidate.slice(prefix.length)}`
});

export const resourceDefinitions: ResourceDefinition[] = [
  exactResource("dashboard://today", "Today's dashboard", "memory:read", "/api/dashboard/today"),
  exactResource("projects://all", "All projects", "projects:read", "/api/projects"),
  exactResource("tasks://all", "All tasks", "tasks:read", "/api/tasks"),
  exactResource("notes://all", "All notes", "memory:read", "/api/notes"),
  exactResource("documents://all", "All documents", "documents:read", "/api/documents"),
  exactResource("review-queue://pending", "Pending review queue", "admin", "/api/review-queue"),
  exactResource("audit-events://recent", "Recent audit events", "admin", "/api/audit-events"),
  exactResource("agents://state", "Agent tokens and activity", "admin", "/api/agents"),
  idResource("project://{projectId}", "Project by id", "projects:read", "project://", "/api/projects"),
  idResource("task://{taskId}", "Task by id", "tasks:read", "task://", "/api/tasks"),
  idResource("note://{noteId}", "Note by id", "memory:read", "note://", "/api/notes"),
  idResource("document://{documentId}", "Document by id", "documents:read", "document://", "/api/documents"),
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

export const listedResources = resourceDefinitions.map(({ requiredScope, matches, buildPath, extractText, ...resource }) => resource);

export function getResourceDefinition(uri: string) {
  return resourceDefinitions.find((resource) => resource.matches(uri));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
