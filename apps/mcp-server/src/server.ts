import { loadEnv } from "@personal-context-os/config";
import { createDb, ensureDefaultWorkspace, agentRuns, auditEvents } from "@personal-context-os/db";
import { eq } from "drizzle-orm";
import Fastify from "fastify";
import { authenticateAgent, requireToolScope, type AgentIdentity } from "./auth.js";
import { executeTool, readResource, type McpExecutionRuntime } from "./execution.js";
import { isAcceptedClientNotification, type JsonRpcEnvelope } from "./protocol.js";
import { getResourceDefinition, listedResources } from "./resources.js";
import { getToolDefinition, toolDefinitions } from "./tools.js";

const env = loadEnv();
const database = createDb(env.DATABASE_URL);
await ensureDefaultWorkspace(database.db);
const port = Number(process.env.PORT ?? 4100);
const runtime: McpExecutionRuntime = { db: database.db, apiBaseUrl: env.API_BASE_URL };

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true }));

app.post("/mcp", async (request, reply) => {
  const body = request.body as JsonRpcEnvelope;

  if (isAcceptedClientNotification(body)) {
    return reply.code(202).send();
  }

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
      resources: listedResources
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
    const resource = getResourceDefinition(uri);
    const data = await readResource(runtime, agent, bearerToken, uri);
    return {
      contents: [{ uri, mimeType: resource?.mimeType ?? "application/json", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }]
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
    const result = await executeTool(runtime, agent, bearerToken, name, args);
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
