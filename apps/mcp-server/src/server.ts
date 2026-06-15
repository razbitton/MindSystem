import { loadEnv } from "@personal-context-os/config";
import { createDb, ensureDefaultWorkspace, agentRuns, auditEvents, entityEdges } from "@personal-context-os/db";
import { eq } from "drizzle-orm";
import Fastify from "fastify";
import { authenticateAgent, requireToolScope, type AgentIdentity } from "./auth.js";
import { getToolDefinition, toolDefinitions } from "./tools.js";

const env = loadEnv();
const database = createDb(env.DATABASE_URL);
await ensureDefaultWorkspace(database.db);
const port = Number(process.env.PORT ?? 4100);

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true }));

app.post("/mcp", async (request, reply) => {
  const body = request.body as { id?: string | number | null; method?: string; params?: Record<string, unknown> };

  try {
    const result = await handleJsonRpc(body.method ?? "", body.params ?? {}, extractToken(request.headers));
    return { jsonrpc: "2.0", id: body.id ?? null, result };
  } catch (error) {
    reply.code(400);
    return {
      jsonrpc: "2.0",
      id: body.id ?? null,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : "MCP server error"
      }
    };
  }
});

async function handleJsonRpc(method: string, params: Record<string, unknown>, bearerToken: string | null) {
  if (method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {}, resources: {}, prompts: {} },
      serverInfo: { name: "personal-context-os", version: "0.1.0" }
    };
  }

  if (method === "tools/list") {
    return { tools: toolDefinitions.map(({ requiredScope, ...tool }) => tool) };
  }

  if (method === "resources/list") {
    return {
      resources: [
        { uri: "dashboard://today", name: "Today's dashboard", mimeType: "application/json" },
        { uri: "project://{projectId}", name: "Project by id", mimeType: "application/json" },
        { uri: "task://{taskId}", name: "Task by id", mimeType: "application/json" },
        { uri: "note://{noteId}", name: "Note by id", mimeType: "application/json" },
        { uri: "document://{documentId}", name: "Document by id", mimeType: "application/json" },
        { uri: "context-pack://project/{projectId}", name: "Project context pack", mimeType: "text/markdown" }
      ]
    };
  }

  if (method === "prompts/list") {
    return {
      prompts: [
        {
          name: "project_context_brief",
          description: "Summarize the current project context before making changes."
        }
      ]
    };
  }

  if (!bearerToken) throw new Error("Agent token required");
  const agent = await authenticateAgent(database.db, bearerToken);

  if (method === "tools/call") {
    const name = String(params.name ?? "");
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    const result = await callTool(agent, bearerToken, name, args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (method === "resources/read") {
    const uri = String(params.uri ?? "");
    const data = await readResource(agent, bearerToken, uri);
    return {
      contents: [{ uri, mimeType: uri.startsWith("context-pack://") ? "text/markdown" : "application/json", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }]
    };
  }

  throw new Error(`Unsupported MCP method: ${method}`);
}

async function callTool(agent: AgentIdentity, bearerToken: string, name: string, args: Record<string, unknown>) {
  const tool = getToolDefinition(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  requireToolScope(agent.scopes, tool.requiredScope);

  const startedAt = new Date();
  const [run] = await database.db
    .insert(agentRuns)
    .values({
      workspaceId: agent.workspaceId,
      agentTokenId: agent.id,
      toolName: name,
      input: args,
      status: "running",
      startedAt
    })
    .returning();

  await database.db.insert(auditEvents).values({
    workspaceId: agent.workspaceId,
    actorType: "agent",
    actorId: agent.id,
    action: "mcp tool call",
    metadata: { toolName: name, args }
  });

  try {
    const result = await executeTool(agent, bearerToken, name, args);
    if (run) {
      await database.db
        .update(agentRuns)
        .set({ status: "completed", completedAt: new Date(), outputSummary: summarizeResult(result) })
        .where(eq(agentRuns.id, run.id));
    }
    return result;
  } catch (error) {
    if (run) {
      await database.db
        .update(agentRuns)
        .set({ status: "failed", completedAt: new Date(), outputSummary: error instanceof Error ? error.message : "Tool failed" })
        .where(eq(agentRuns.id, run.id));
    }
    throw error;
  }
}

async function executeTool(agent: AgentIdentity, bearerToken: string, name: string, args: Record<string, unknown>) {
  if (name === "search_memory") {
    return apiGet("/api/search", args, bearerToken);
  }
  if (name === "ingest_free_text") {
    return apiPost("/api/ingest/free-text", { sourceType: "codex", ...args }, bearerToken);
  }
  if (name === "create_project") {
    return apiPost("/api/projects", { priority: "medium", ...args }, bearerToken);
  }
  if (name === "create_task") {
    return apiPost("/api/tasks", args, bearerToken);
  }
  if (name === "update_task") {
    const { id, ...body } = args;
    return apiPatch(`/api/tasks/${String(id)}`, body, bearerToken);
  }
  if (name === "complete_task") {
    return apiPost(`/api/tasks/${String(args.id)}/complete`, {}, bearerToken);
  }
  if (name === "get_project_context" || name === "create_context_pack") {
    return apiGet(`/api/projects/${String(args.projectId)}/context`, {}, bearerToken);
  }
  if (name === "get_daily_dashboard") {
    return apiGet("/api/dashboard/today", {}, bearerToken);
  }
  if (name === "get_urgent_tasks") {
    return apiGet("/api/tasks", { priority: "urgent", limit: args.limit ?? 25 }, bearerToken);
  }
  if (name === "attach_document") {
    return apiPost("/api/documents", args, bearerToken);
  }
  if (name === "link_entities") {
    const [edge] = await database.db
      .insert(entityEdges)
      .values({
        workspaceId: agent.workspaceId,
        fromEntityId: String(args.fromEntityId),
        toEntityId: String(args.toEntityId),
        relationType: String(args.relationType) as "belongs_to",
        confidenceScore: "1"
      })
      .returning();
    return { edge };
  }
  throw new Error(`Unhandled tool: ${name}`);
}

async function readResource(agent: AgentIdentity, bearerToken: string, uri: string) {
  if (uri === "dashboard://today") {
    requireToolScope(agent.scopes, "memory:read");
    return apiGet("/api/dashboard/today", {}, bearerToken);
  }
  if (uri.startsWith("project://")) {
    requireToolScope(agent.scopes, "projects:read");
    return apiGet(`/api/projects/${uri.replace("project://", "")}`, {}, bearerToken);
  }
  if (uri.startsWith("context-pack://project/")) {
    requireToolScope(agent.scopes, "projects:read");
    const data = await apiGet(`/api/projects/${uri.replace("context-pack://project/", "")}/context`, {}, bearerToken);
    return data.contextPack ?? JSON.stringify(data);
  }
  if (uri.startsWith("task://")) {
    requireToolScope(agent.scopes, "tasks:read");
    return apiGet(`/api/tasks/${uri.replace("task://", "")}`, {}, bearerToken);
  }
  if (uri.startsWith("note://")) {
    requireToolScope(agent.scopes, "memory:read");
    return apiGet(`/api/notes/${uri.replace("note://", "")}`, {}, bearerToken);
  }
  if (uri.startsWith("document://")) {
    requireToolScope(agent.scopes, "documents:read");
    return apiGet(`/api/documents/${uri.replace("document://", "")}`, {}, bearerToken);
  }
  throw new Error(`Unsupported resource URI: ${uri}`);
}

async function apiGet(path: string, query: Record<string, unknown>, bearerToken: string) {
  const url = new URL(path, env.API_BASE_URL);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { headers: authHeaders(bearerToken) });
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  return response.json();
}

async function apiPost(path: string, body: Record<string, unknown>, bearerToken: string) {
  const response = await fetch(new URL(path, env.API_BASE_URL), {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(bearerToken) },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`API request failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function apiPatch(path: string, body: Record<string, unknown>, bearerToken: string) {
  const response = await fetch(new URL(path, env.API_BASE_URL), {
    method: "PATCH",
    headers: { "content-type": "application/json", ...authHeaders(bearerToken) },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`API request failed: ${response.status} ${await response.text()}`);
  return response.json();
}

function authHeaders(bearerToken: string) {
  return { authorization: `Bearer ${bearerToken}` };
}

function extractToken(headers: Record<string, string | string[] | undefined>) {
  const auth = Array.isArray(headers.authorization) ? headers.authorization[0] : headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  const token = headers["x-agent-token"];
  return Array.isArray(token) ? token[0] ?? null : token ?? null;
}

function summarizeResult(result: unknown) {
  const text = JSON.stringify(result);
  return text.length > 500 ? `${text.slice(0, 497)}...` : text;
}

try {
  await app.listen({ host: "0.0.0.0", port });
  app.log.info(`Personal Context OS MCP server listening on :${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
