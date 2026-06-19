import { describe, expect, it } from "vitest";
import type { AgentScope } from "@personal-context-os/shared";
import { requireToolScope } from "./auth.js";
import { getToolDefinition, toolDefinitions } from "./tools.js";

const expectedScopes: Record<string, AgentScope> = {
  search_memory: "memory:read",
  ingest_free_text: "memory:write",
  list_raw_items: "memory:read",
  get_raw_item: "memory:read",
  delete_raw_item: "memory:write",
  clear_raw_items: "memory:write",
  list_entities: "memory:read",
  get_entity: "memory:read",
  delete_entity: "admin",
  list_projects: "projects:read",
  create_project: "projects:write",
  get_project: "projects:read",
  update_project: "projects:write",
  delete_project: "projects:write",
  archive_project: "projects:write",
  list_tasks: "tasks:read",
  create_task: "tasks:write",
  get_task: "tasks:read",
  update_task: "tasks:write",
  delete_task: "tasks:write",
  complete_task: "tasks:write",
  cancel_task: "tasks:write",
  list_notes: "memory:read",
  create_note: "memory:write",
  get_note: "memory:read",
  update_note: "memory:write",
  delete_note: "memory:write",
  list_documents: "documents:read",
  attach_document: "documents:write",
  get_document: "documents:read",
  update_document: "documents:write",
  delete_document: "documents:write",
  list_reminders: "memory:read",
  create_reminder: "memory:write",
  get_reminder: "memory:read",
  update_reminder: "memory:write",
  delete_reminder: "memory:write",
  get_project_context: "projects:read",
  get_daily_dashboard: "memory:read",
  get_urgent_tasks: "tasks:read",
  link_entities: "memory:write",
  create_context_pack: "projects:read",
  list_review_queue: "admin",
  approve_review_item: "admin",
  reject_review_item: "admin",
  delete_review_item: "admin",
  clear_review_queue: "admin",
  delete_agent_run: "admin",
  clear_agent_runs: "admin",
  list_audit_events: "admin",
  delete_audit_event: "admin",
  clear_audit_events: "admin",
  list_retrieval_logs: "admin",
  delete_retrieval_log: "admin",
  clear_retrieval_logs: "admin",
  list_schema_definitions: "admin",
  delete_schema_definition: "admin",
  clear_schema_definitions: "admin",
  list_project_schema_overrides: "admin",
  delete_project_schema_override: "admin",
  clear_project_schema_overrides: "admin",
  get_data_inventory: "admin",
  purge_workspace_data: "admin"
};

describe("MCP tool definitions", () => {
  it("includes the REST parity tools", () => {
    const names = toolDefinitions.map((tool) => tool.name);

    for (const name of Object.keys(expectedScopes)) {
      expect(names).toContain(name);
    }
  });

  it("declares the expected required scope for every tool", () => {
    for (const [name, requiredScope] of Object.entries(expectedScopes)) {
      const tool = getToolDefinition(name);

      expect(tool?.requiredScope).toBe(requiredScope);
      expect(() => requireToolScope([requiredScope], requiredScope)).not.toThrow();
      expect(() => requireToolScope(["admin"], requiredScope)).not.toThrow();
      expect(() => requireToolScope([], requiredScope)).toThrow(`Missing required scope: ${requiredScope}`);
    }
  });

  it("keeps update and delete tools on write scopes", () => {
    expect(getToolDefinition("update_project")?.requiredScope).toBe("projects:write");
    expect(getToolDefinition("delete_project")?.requiredScope).toBe("projects:write");
    expect(getToolDefinition("update_task")?.requiredScope).toBe("tasks:write");
    expect(getToolDefinition("delete_task")?.requiredScope).toBe("tasks:write");
    expect(getToolDefinition("update_note")?.requiredScope).toBe("memory:write");
    expect(getToolDefinition("delete_note")?.requiredScope).toBe("memory:write");
    expect(getToolDefinition("delete_raw_item")?.requiredScope).toBe("memory:write");
    expect(getToolDefinition("delete_entity")?.requiredScope).toBe("admin");
    expect(getToolDefinition("update_document")?.requiredScope).toBe("documents:write");
    expect(getToolDefinition("delete_document")?.requiredScope).toBe("documents:write");
    expect(getToolDefinition("update_reminder")?.requiredScope).toBe("memory:write");
    expect(getToolDefinition("delete_reminder")?.requiredScope).toBe("memory:write");
  });

  it("keeps observability and token administration tools admin-only", () => {
    expect(getToolDefinition("list_review_queue")?.requiredScope).toBe("admin");
    expect(getToolDefinition("approve_review_item")?.requiredScope).toBe("admin");
    expect(getToolDefinition("reject_review_item")?.requiredScope).toBe("admin");
    expect(getToolDefinition("list_audit_events")?.requiredScope).toBe("admin");
    expect(getToolDefinition("purge_workspace_data")?.requiredScope).toBe("admin");
    expect(getToolDefinition("clear_audit_events")?.requiredScope).toBe("admin");
    expect(getToolDefinition("clear_agent_runs")?.requiredScope).toBe("admin");
  });

  it("does not expose a generic arbitrary REST tool", () => {
    const names = toolDefinitions.map((tool) => tool.name);
    const forbiddenNames = [
      "call_rest",
      "call_rest_path",
      "rest_request",
      "api_request",
      "http_request",
      "fetch_url",
      "list_agents",
      "create_agent_token",
      "revoke_agent_token",
      "delete_agent_token"
    ];

    for (const name of forbiddenNames) {
      expect(names).not.toContain(name);
    }
  });
});
