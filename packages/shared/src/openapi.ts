import { zodToJsonSchema } from "zod-to-json-schema";
import { agentMemoryBootstrapInstructions } from "./agent-policy.js";
import {
  aiProcessingBackfillSchema,
  aiProcessingScheduleSchema,
  createDocumentSchema,
  createNoteSchema,
  createProjectSchema,
  createReminderSchema,
  createTaskSchema,
  deleteRawItemSchema,
  getRelevantContextSchema,
  googleCalendarCreateEventSchema,
  googleCalendarPatchEventSchema,
  googleCalendarPreferencesSchema,
  ingestFreeTextSchema,
  linkMemorySchema,
  loginSchema,
  memoryConsolidationSchema,
  patchDocumentSchema,
  patchNoteSchema,
  patchProjectSchema,
  patchReminderSchema,
  patchTaskSchema,
  prepareTurnContextSchema,
  purgeWorkspaceDataSchema,
  recallMemorySchema,
  reviewDecisionSchema,
  reviewMergeSchema,
  reviewSupersedeSchema,
  setDailyObjectiveSchema,
  storeMemorySchema,
  supersedeMemorySchema,
  uploadDocumentSchema
} from "./schemas.js";

export function buildOpenApiSpec() {
  const json = (schema: Parameters<typeof zodToJsonSchema>[0]) => zodToJsonSchema(schema, { target: "openApi3" });

  return {
    openapi: "3.1.0",
    info: {
      title: "Personal Context OS API",
      version: "0.1.0",
      description: agentMemoryBootstrapInstructions
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
          summary: "Keyword/full-text search using structured filters",
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
      "/memory/recall": {
        post: {
          summary: "Recall agent memory using hybrid semantic and keyword retrieval",
          requestBody: { required: true, content: { "application/json": { schema: json(recallMemorySchema) } } },
          responses: { "200": { description: "Ranked memory results and retrieval metadata" } }
        }
      },
      "/context/turn": {
        post: {
          summary: "Prepare deterministic model-ready context for an agent turn",
          requestBody: { required: true, content: { "application/json": { schema: json(prepareTurnContextSchema) } } },
          responses: { "200": { description: "Context markdown, structured context fields, source quotes, conflicts, stale items, and retrieval trace" } }
        }
      },
      "/memory/{id}": {
        get: {
          summary: "Get a memory record with entity and sources",
          responses: { "200": { description: "Memory details" } }
        }
      },
      "/memory/context": {
        post: {
          summary: "Build a compact relevant context bundle for an agent turn",
          requestBody: { required: true, content: { "application/json": { schema: json(getRelevantContextSchema) } } },
          responses: { "200": { description: "Context bundle with memories, sources, and retrieval trace" } }
        }
      },
      "/memory/store": {
        post: {
          summary: "Store durable agent memory from free text or structured memory candidates",
          requestBody: { required: true, content: { "application/json": { schema: json(storeMemorySchema) } } },
          responses: { "200": { description: "Created, refreshed, and review-queued memory records" } }
        }
      },
      "/memory/{id}/supersede": {
        post: {
          summary: "Supersede a memory record while preserving history",
          requestBody: { required: true, content: { "application/json": { schema: json(supersedeMemorySchema) } } },
          responses: { "200": { description: "Previous memory and replacement memory" } }
        }
      },
      "/memory/link": {
        post: {
          summary: "Link memory records or entities",
          requestBody: { required: true, content: { "application/json": { schema: json(linkMemorySchema) } } },
          responses: { "200": { description: "Created entity edge" } }
        }
      },
      "/raw-items": {
        get: { summary: "List raw captures", responses: { "200": { description: "Raw captures" } } }
      },
      "/raw-items/{id}": {
        get: { summary: "Get a raw capture", responses: { "200": { description: "Raw capture" } } },
        delete: { summary: "Delete a raw capture", responses: { "200": { description: "Deleted" } } }
      },
      "/raw-items/{id}/delete": {
        post: {
          summary: "Delete a raw capture with options",
          requestBody: { required: false, content: { "application/json": { schema: json(deleteRawItemSchema) } } },
          responses: { "200": { description: "Deleted" } }
        }
      },
      "/raw-items/clear": {
        post: {
          summary: "Delete all raw captures",
          requestBody: { required: false, content: { "application/json": { schema: json(deleteRawItemSchema) } } },
          responses: { "200": { description: "Deleted" } }
        }
      },
      "/entities": {
        get: { summary: "List generic entities", responses: { "200": { description: "Entities" } } }
      },
      "/entities/{id}": {
        get: { summary: "Get a generic entity", responses: { "200": { description: "Entity" } } },
        delete: { summary: "Delete a generic entity and cascading typed record", responses: { "200": { description: "Deleted" } } }
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
      "/tasks/{id}/daily-objective": {
        post: {
          summary: "Pin, snooze, or clear a task in the daily objective agenda",
          requestBody: { required: true, content: { "application/json": { schema: json(setDailyObjectiveSchema) } } },
          responses: { "200": { description: "Daily objective override" } }
        }
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
      "/documents/upload": {
        post: {
          summary: "Upload a document file and attach it to the workspace",
          requestBody: { required: true, content: { "application/json": { schema: json(uploadDocumentSchema) } } },
          responses: { "200": { description: "Document" } }
        }
      },
      "/documents/{id}": {
        get: { summary: "Get a document", responses: { "200": { description: "Document" } } },
        patch: {
          summary: "Update document metadata or extracted text",
          requestBody: { required: true, content: { "application/json": { schema: json(patchDocumentSchema) } } },
          responses: { "200": { description: "Document" } }
        },
        delete: { summary: "Delete a document", responses: { "200": { description: "Deleted" } } }
      },
      "/documents/{id}/download": {
        get: {
          summary: "Download or open a document file",
          parameters: [
            {
              name: "disposition",
              in: "query",
              schema: { type: "string", enum: ["attachment", "inline"], default: "attachment" }
            }
          ],
          responses: {
            "200": {
              description: "Document file stream",
              content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } }
            }
          }
        }
      },
      "/reminders": {
        post: {
          summary: "Create a reminder",
          requestBody: { required: true, content: { "application/json": { schema: json(createReminderSchema) } } },
          responses: { "200": { description: "Reminder" } }
        },
        get: { summary: "List reminders", responses: { "200": { description: "Reminders" } } }
      },
      "/reminders/{id}": {
        get: { summary: "Get a reminder", responses: { "200": { description: "Reminder" } } },
        patch: {
          summary: "Update a reminder",
          requestBody: { required: true, content: { "application/json": { schema: json(patchReminderSchema) } } },
          responses: { "200": { description: "Reminder" } }
        },
        delete: { summary: "Delete a reminder", responses: { "200": { description: "Deleted" } } }
      },
      "/dashboard/today": {
        get: {
          summary: "Get dashboard data for today",
          parameters: [
            { name: "date", in: "query", schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } },
            { name: "start", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "end", in: "query", schema: { type: "string", format: "date-time" } }
          ],
          responses: { "200": { description: "Dashboard" } }
        }
      },
      "/google-calendar/status": {
        get: {
          summary: "Get Google Calendar connection status",
          responses: { "200": { description: "Google Calendar connection status" } }
        }
      },
      "/google-calendar/connect": {
        post: {
          summary: "Start Google Calendar OAuth connection",
          responses: { "200": { description: "Google authorization URL" } }
        }
      },
      "/google-calendar/oauth/callback": {
        get: {
          summary: "Complete Google Calendar OAuth connection",
          parameters: [
            { name: "code", in: "query", schema: { type: "string" } },
            { name: "state", in: "query", schema: { type: "string" } }
          ],
          responses: { "302": { description: "Redirects back to dashboard" } }
        }
      },
      "/google-calendar/disconnect": {
        post: {
          summary: "Disconnect Google Calendar and revoke stored token when possible",
          responses: { "200": { description: "Disconnected" } }
        }
      },
      "/openai-codex/status": {
        get: {
          summary: "Get OpenAI Codex OAuth connection status",
          responses: { "200": { description: "OpenAI Codex OAuth status" } }
        }
      },
      "/openai-codex/oauth/start": {
        post: {
          summary: "Start OpenAI Codex device-code OAuth",
          responses: {
            "200": {
              description: "Device-code login details",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["verificationUrl", "userCode", "deviceAuthId", "intervalMs", "expiresInMs"],
                    properties: {
                      verificationUrl: { type: "string" },
                      userCode: { type: "string" },
                      deviceAuthId: { type: "string" },
                      intervalMs: { type: "number" },
                      expiresInMs: { type: "number" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/openai-codex/oauth/poll": {
        post: {
          summary: "Poll and complete OpenAI Codex device-code OAuth",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["deviceAuthId", "userCode"],
                  properties: {
                    deviceAuthId: { type: "string" },
                    userCode: { type: "string" }
                  }
                }
              }
            }
          },
          responses: { "200": { description: "Pending or connected result" } }
        }
      },
      "/openai-codex/disconnect": {
        post: {
          summary: "Disconnect stored OpenAI Codex OAuth credentials",
          responses: { "200": { description: "Disconnected" } }
        }
      },
      "/google-calendar/calendars": {
        get: {
          summary: "List Google calendars available to the connected account",
          responses: { "200": { description: "Calendars" } }
        }
      },
      "/google-calendar/preferences": {
        patch: {
          summary: "Update selected Google calendars",
          requestBody: { required: true, content: { "application/json": { schema: json(googleCalendarPreferencesSchema) } } },
          responses: { "200": { description: "Calendar preferences" } }
        }
      },
      "/google-calendar/events": {
        get: {
          summary: "List Google Calendar events for a visible date range",
          parameters: [
            { name: "timeMin", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "timeMax", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "timeZone", in: "query", schema: { type: "string" } },
            { name: "calendarIds", in: "query", schema: { type: "string" } }
          ],
          responses: { "200": { description: "Google Calendar events" } }
        },
        post: {
          summary: "Create a Google Calendar event",
          requestBody: { required: true, content: { "application/json": { schema: json(googleCalendarCreateEventSchema) } } },
          responses: { "200": { description: "Created Google Calendar event" } }
        }
      },
      "/google-calendar/events/{eventId}": {
        patch: {
          summary: "Update a Google Calendar event",
          requestBody: { required: true, content: { "application/json": { schema: json(googleCalendarPatchEventSchema) } } },
          responses: { "200": { description: "Updated Google Calendar event" } }
        },
        delete: {
          summary: "Delete a Google Calendar event",
          parameters: [
            { name: "eventId", in: "path", required: true, schema: { type: "string" } },
            { name: "calendarId", in: "query", required: true, schema: { type: "string" } },
            { name: "sendUpdates", in: "query", schema: { type: "string", enum: ["all", "externalOnly", "none"] } }
          ],
          responses: { "200": { description: "Deleted" } }
        }
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
      "/review-queue/{id}/merge": {
        post: {
          summary: "Merge a review memory candidate into an existing memory",
          requestBody: { required: true, content: { "application/json": { schema: json(reviewMergeSchema) } } },
          responses: { "200": { description: "Review item and merged memory" } }
        }
      },
      "/review-queue/{id}/supersede": {
        post: {
          summary: "Supersede an existing memory from a review item",
          requestBody: { required: true, content: { "application/json": { schema: json(reviewSupersedeSchema) } } },
          responses: { "200": { description: "Review item and replacement memory" } }
        }
      },
      "/review-queue/{id}/mark-stale": {
        post: { summary: "Mark a reviewed memory as stale", responses: { "200": { description: "Review item and memory" } } }
      },
      "/review-queue/{id}/pin-preference": {
        post: { summary: "Pin a repeated preference memory", responses: { "200": { description: "Review item and memory" } } }
      },
      "/review-queue/{id}/reject": {
        post: { summary: "Reject a review item", responses: { "200": { description: "Review item" } } }
      },
      "/review-queue/{id}": {
        delete: { summary: "Delete a review item", responses: { "200": { description: "Deleted" } } }
      },
      "/review-queue/clear": {
        post: { summary: "Delete all review items", responses: { "200": { description: "Deleted" } } }
      },
      "/agents/bootstrap": {
        get: {
          summary: "Get agent bootstrap instructions for using the memory API",
          description: "Call this once when connecting through the REST API, then follow the returned memory workflow on each user turn.",
          responses: {
            "200": {
              description: "Agent memory bootstrap instructions, workflow, tools, and endpoint hints",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["server", "instructions", "memoryPolicy", "workflow", "primaryTools", "mcp", "api", "scopes"],
                    properties: {
                      server: { type: "object" },
                      instructions: { type: "string" },
                      memoryPolicy: { type: "string" },
                      workflow: { type: "array", items: { type: "object" } },
                      primaryTools: { type: "array", items: { type: "object" } },
                      mcp: { type: "object" },
                      api: { type: "object" },
                      scopes: { type: "object" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/agents/runs/{id}": {
        delete: { summary: "Delete an agent run", responses: { "200": { description: "Deleted" } } }
      },
      "/agents/runs/clear": {
        post: { summary: "Delete all agent runs", responses: { "200": { description: "Deleted" } } }
      },
      "/audit-events": {
        get: { summary: "List audit events", responses: { "200": { description: "Audit events" } } }
      },
      "/audit-events/{id}": {
        delete: { summary: "Delete an audit event", responses: { "200": { description: "Deleted" } } }
      },
      "/audit-events/clear": {
        post: { summary: "Delete all audit events", responses: { "200": { description: "Deleted" } } }
      },
      "/retrieval-logs": {
        get: { summary: "List retrieval logs", responses: { "200": { description: "Retrieval logs" } } }
      },
      "/retrieval-logs/{id}": {
        delete: { summary: "Delete a retrieval log", responses: { "200": { description: "Deleted" } } }
      },
      "/retrieval-logs/clear": {
        post: { summary: "Delete all retrieval logs", responses: { "200": { description: "Deleted" } } }
      },
      "/schema-definitions": {
        get: { summary: "List schema definitions", responses: { "200": { description: "Schema definitions" } } }
      },
      "/schema-definitions/{id}": {
        delete: { summary: "Delete a schema definition", responses: { "200": { description: "Deleted" } } }
      },
      "/schema-definitions/clear": {
        post: { summary: "Delete all schema definitions", responses: { "200": { description: "Deleted" } } }
      },
      "/project-schema-overrides": {
        get: { summary: "List project schema overrides", responses: { "200": { description: "Project schema overrides" } } }
      },
      "/project-schema-overrides/{id}": {
        delete: { summary: "Delete a project schema override", responses: { "200": { description: "Deleted" } } }
      },
      "/project-schema-overrides/clear": {
        post: { summary: "Delete all project schema overrides", responses: { "200": { description: "Deleted" } } }
      },
      "/admin/data-inventory": {
        get: { summary: "Get workspace data inventory counts", responses: { "200": { description: "Inventory counts" } } }
      },
      "/admin/purge-data": {
        post: {
          summary: "Bulk-delete selected workspace data categories",
          requestBody: { required: false, content: { "application/json": { schema: json(purgeWorkspaceDataSchema) } } },
          responses: { "200": { description: "Deleted counts" } }
        }
      },
      "/admin/ai-processing/runs": {
        get: {
          summary: "List AI processing runs",
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 25 } }
          ],
          responses: { "200": { description: "AI processing run history" } }
        }
      },
      "/admin/ai-processing/backfill": {
        post: {
          summary: "Queue a one-off AI memory backfill over raw captures",
          requestBody: { required: false, content: { "application/json": { schema: json(aiProcessingBackfillSchema) } } },
          responses: { "200": { description: "Queued AI processing run" } }
        }
      },
      "/admin/memory-consolidation": {
        post: {
          summary: "Queue memory lifecycle consolidation review",
          requestBody: { required: false, content: { "application/json": { schema: json(memoryConsolidationSchema) } } },
          responses: { "200": { description: "Queued consolidation job" } }
        }
      },
      "/admin/ai-processing/schedule": {
        get: {
          summary: "Get the workspace AI processing schedule",
          responses: { "200": { description: "AI processing schedule" } }
        },
        patch: {
          summary: "Enable, disable, or update routine AI processing",
          requestBody: { required: true, content: { "application/json": { schema: json(aiProcessingScheduleSchema) } } },
          responses: { "200": { description: "AI processing schedule" } }
        }
      },
      "/openapi.json": {
        get: { summary: "Get OpenAPI spec", responses: { "200": { description: "OpenAPI" } } }
      }
    }
  };
}
