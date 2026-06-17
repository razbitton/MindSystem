import { zodToJsonSchema } from "zod-to-json-schema";
import {
  createAgentTokenSchema,
  createDocumentSchema,
  createNoteSchema,
  createProjectSchema,
  createTaskSchema,
  ingestFreeTextSchema,
  loginSchema,
  patchNoteSchema,
  patchProjectSchema,
  patchTaskSchema,
  reviewDecisionSchema
} from "./schemas.js";

export function buildOpenApiSpec() {
  const json = (schema: Parameters<typeof zodToJsonSchema>[0]) => zodToJsonSchema(schema, { target: "openApi3" });

  return {
    openapi: "3.1.0",
    info: {
      title: "Personal Context OS API",
      version: "0.1.0"
    },
    servers: [{ url: "/api" }],
    paths: {
      "/auth/login": {
        post: {
          summary: "Create a browser session from email and password",
          requestBody: { required: true, content: { "application/json": { schema: json(loginSchema) } } },
          responses: {
            "200": { description: "Authenticated user and session expiry" },
            "401": { description: "Invalid email or password" }
          }
        }
      },
      "/auth/me": {
        get: {
          summary: "Get the current browser session user",
          responses: {
            "200": { description: "Authenticated user" },
            "401": { description: "Not authenticated" }
          }
        }
      },
      "/auth/logout": {
        post: {
          summary: "Clear the current browser session",
          responses: { "200": { description: "Logged out" } }
        }
      },
      "/ingest/free-text": {
        post: {
          summary: "Capture free-form text and normalize it into entities",
          requestBody: { required: true, content: { "application/json": { schema: json(ingestFreeTextSchema) } } },
          responses: { "200": { description: "Created entities and review items" } }
        }
      },
      "/search": {
        get: {
          summary: "Hybrid search placeholder using structured filters and full-text search",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "entity_type", in: "query", schema: { type: "string" } },
            { name: "project_id", in: "query", schema: { type: "string", format: "uuid" } },
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "due_before", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 25 } }
          ],
          responses: { "200": { description: "Search results" } }
        }
      },
      "/projects": {
        post: {
          summary: "Create a project",
          requestBody: { required: true, content: { "application/json": { schema: json(createProjectSchema) } } },
          responses: { "200": { description: "Project" } }
        },
        get: { summary: "List projects", responses: { "200": { description: "Projects" } } }
      },
      "/projects/{id}": {
        get: { summary: "Get a project", responses: { "200": { description: "Project" } } },
        patch: {
          summary: "Update a project",
          requestBody: { required: true, content: { "application/json": { schema: json(patchProjectSchema) } } },
          responses: { "200": { description: "Project" } }
        },
        delete: { summary: "Delete a project", responses: { "200": { description: "Deleted" } } }
      },
      "/projects/{id}/context": {
        get: { summary: "Get a project context pack", responses: { "200": { description: "Project context" } } }
      },
      "/tasks": {
        post: {
          summary: "Create a task",
          requestBody: { required: true, content: { "application/json": { schema: json(createTaskSchema) } } },
          responses: { "200": { description: "Task" } }
        },
        get: { summary: "List tasks", responses: { "200": { description: "Tasks" } } }
      },
      "/tasks/{id}": {
        get: { summary: "Get a task", responses: { "200": { description: "Task" } } },
        patch: {
          summary: "Update a task",
          requestBody: { required: true, content: { "application/json": { schema: json(patchTaskSchema) } } },
          responses: { "200": { description: "Task" } }
        },
        delete: { summary: "Delete a task", responses: { "200": { description: "Deleted" } } }
      },
      "/tasks/{id}/complete": {
        post: { summary: "Complete a task", responses: { "200": { description: "Task" } } }
      },
      "/notes": {
        post: {
          summary: "Create a note",
          requestBody: { required: true, content: { "application/json": { schema: json(createNoteSchema) } } },
          responses: { "200": { description: "Note" } }
        },
        get: { summary: "List notes", responses: { "200": { description: "Notes" } } }
      },
      "/notes/{id}": {
        get: { summary: "Get a note", responses: { "200": { description: "Note" } } },
        patch: {
          summary: "Update a note",
          requestBody: { required: true, content: { "application/json": { schema: json(patchNoteSchema) } } },
          responses: { "200": { description: "Note" } }
        },
        delete: { summary: "Delete a note", responses: { "200": { description: "Deleted" } } }
      },
      "/documents": {
        post: {
          summary: "Attach document metadata or extracted text",
          requestBody: { required: true, content: { "application/json": { schema: json(createDocumentSchema) } } },
          responses: { "200": { description: "Document" } }
        },
        get: { summary: "List documents", responses: { "200": { description: "Documents" } } }
      },
      "/documents/{id}": {
        get: { summary: "Get a document", responses: { "200": { description: "Document" } } }
      },
      "/dashboard/today": {
        get: { summary: "Get dashboard data for today", responses: { "200": { description: "Dashboard" } } }
      },
      "/review-queue": {
        get: { summary: "List pending review items", responses: { "200": { description: "Review items" } } }
      },
      "/review-queue/{id}/approve": {
        post: {
          summary: "Approve a review item",
          requestBody: { required: false, content: { "application/json": { schema: json(reviewDecisionSchema) } } },
          responses: { "200": { description: "Review item" } }
        }
      },
      "/review-queue/{id}/reject": {
        post: { summary: "Reject a review item", responses: { "200": { description: "Review item" } } }
      },
      "/agents": {
        get: { summary: "List agent tokens and recent runs", responses: { "200": { description: "Agents" } } }
      },
      "/agents/tokens": {
        post: {
          summary: "Create a scoped agent token",
          requestBody: { required: true, content: { "application/json": { schema: json(createAgentTokenSchema) } } },
          responses: { "200": { description: "Token. Plaintext is returned once." } }
        }
      },
      "/audit-events": {
        get: { summary: "List audit events", responses: { "200": { description: "Audit events" } } }
      },
      "/openapi.json": {
        get: { summary: "Get OpenAPI spec", responses: { "200": { description: "OpenAPI" } } }
      }
    }
  };
}
