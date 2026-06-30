import type { DbClient } from "@personal-context-os/db";
import { agentRuns, auditEvents } from "@personal-context-os/db";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { IncomingHttpHeaders } from "node:http";
import { authenticateAgent, requireToolScope, type AgentIdentity } from "./auth.js";
import { executeTool, readResource, type McpExecutionRuntime } from "./execution.js";
import { isAcceptedClientNotification, type JsonRpcEnvelope } from "./protocol.js";
import { agentBootstrapText, getResourceDefinition, listedResources } from "./resources.js";
import { getToolDefinition, listToolDefinitionsForTier, type ToolTier } from "./tools.js";

export interface McpRouteOptions {
  db: DbClient;
  apiBaseUrl: string;
  route?: string;
}

export async function registerMcpRoutes(app: FastifyInstance, options: McpRouteOptions) {
  const route = options.route ?? "/mcp";
  const runtime: McpExecutionRuntime = { db: options.db, apiBaseUrl: options.apiBaseUrl };

  app.post(route, async (request, reply) => {
    const body = request.body as JsonRpcEnvelope;

    if (isAcceptedClientNotification(body)) {
      return reply.code(202).send();
    }

    try {
      const result = await handleJsonRpc(options.db, runtime, body.method ?? "", body.params ?? {}, extractToken(request.headers));
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
}

async function handleJsonRpc(
  db: DbClient,
  runtime: McpExecutionRuntime,
  method: string,
  params: Record<string, unknown>,
  bearerToken: string | null
) {
  if (method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {}, resources: {}, prompts: {} },
      serverInfo: { name: "personal-context-os", version: "0.1.0" },
      instructions: agentBootstrapText
    };
  }

  if (method === "tools/list") {
    const tier = parseToolTier(params.tier);
    if (tier === "admin") {
      if (!bearerToken) throw new Error("Agent token required to list admin tools");
      const agent = await authenticateAgent(db, bearerToken);
      requireToolScope(agent.scopes, "admin");
    }
    return { tools: listToolDefinitionsForTier(tier) };
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
          name: "memory_workflow",
          description: "Use durable memory tools safely and consistently before answering or storing new context."
        },
        {
          name: "project_context_brief",
          description: "Summarize the current project context before making changes."
        }
      ]
    };
  }

  if (method === "prompts/get") {
    const name = String(params.name ?? "");
    if (name === "memory_workflow") {
      return {
        description: "Use durable memory tools safely and consistently.",
        messages: [
          {
            role: "user",
            content: { type: "text", text: agentBootstrapText }
          }
        ]
      };
    }
    if (name === "project_context_brief") {
      return {
        description: "Summarize project context before changing project memory or tasks.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Read the relevant project context pack, identify open tasks, recent decisions, constraints, and uncertainties, then state what context you used before making changes."
            }
          }
        ]
      };
    }
    throw new Error(`Unknown prompt: ${name}`);
  }

  if (!bearerToken) throw new Error("Agent token required");
  const agent = await authenticateAgent(db, bearerToken);

  if (method === "tools/call") {
    const name = String(params.name ?? "");
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    try {
      const result = await callTool(db, runtime, agent, bearerToken, name, args);
      return {
        structuredContent: result,
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    } catch (error) {
      const structuredContent = {
        error: error instanceof Error ? error.message : "Tool execution failed",
        toolName: name
      };
      return {
        isError: true,
        structuredContent,
        content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }]
      };
    }
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

async function callTool(
  db: DbClient,
  runtime: McpExecutionRuntime,
  agent: AgentIdentity,
  bearerToken: string,
  name: string,
  args: Record<string, unknown>
) {
  const tool = getToolDefinition(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  requireToolScope(agent.scopes, tool.requiredScope);

  const startedAt = new Date();
  const [run] = await db
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

  await db.insert(auditEvents).values({
    workspaceId: agent.workspaceId,
    actorType: "agent",
    actorId: agent.id,
    action: "mcp tool call",
    metadata: { toolName: name, args }
  });

  try {
    const result = await executeTool(runtime, agent, bearerToken, name, args);
    if (run) {
      await db
        .update(agentRuns)
        .set({ status: "completed", completedAt: new Date(), outputSummary: summarizeResult(result) })
        .where(eq(agentRuns.id, run.id));
    }
    return result;
  } catch (error) {
    if (run) {
      await db
        .update(agentRuns)
        .set({ status: "failed", completedAt: new Date(), outputSummary: error instanceof Error ? error.message : "Tool failed" })
        .where(eq(agentRuns.id, run.id));
    }
    throw error;
  }
}

function extractToken(headers: IncomingHttpHeaders) {
  const auth = Array.isArray(headers.authorization) ? headers.authorization[0] : headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  const token = headers["x-agent-token"];
  return Array.isArray(token) ? token[0] ?? null : token ?? null;
}

function parseToolTier(value: unknown): ToolTier {
  return value === "advanced" || value === "admin" ? value : "default";
}

function summarizeResult(result: unknown) {
  const text = JSON.stringify(result);
  return text.length > 500 ? `${text.slice(0, 497)}...` : text;
}
