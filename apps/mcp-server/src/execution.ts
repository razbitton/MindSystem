import { entityEdges, type DbClient } from "@personal-context-os/db";
import { requireToolScope, type AgentIdentity } from "./auth.js";
import { getResourceDefinition } from "./resources.js";
import { buildRestToolRequest, type RestToolRequest } from "./tools.js";

export interface McpExecutionRuntime {
  db: DbClient;
  apiBaseUrl: string;
  fetchFn?: typeof fetch;
}

export async function executeTool(
  runtime: McpExecutionRuntime,
  agent: AgentIdentity,
  bearerToken: string,
  name: string,
  args: Record<string, unknown>
) {
  const restRequest = buildRestToolRequest(name, args);
  if (restRequest) {
    return executeRestRequest(runtime, restRequest, bearerToken);
  }

  if (name === "link_entities") {
    const [edge] = await runtime.db
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

export async function readResource(runtime: McpExecutionRuntime, agent: AgentIdentity, bearerToken: string, uri: string) {
  const resource = getResourceDefinition(uri);
  if (!resource) throw new Error(`Unsupported resource URI: ${uri}`);

  requireToolScope(agent.scopes, resource.requiredScope);
  const data = await apiGet(runtime, resource.buildPath(uri), {}, bearerToken);
  return resource.extractText ? resource.extractText(data) : data;
}

async function executeRestRequest(runtime: McpExecutionRuntime, request: RestToolRequest, bearerToken: string) {
  if (request.method === "GET") {
    return apiGet(runtime, request.path, request.query ?? {}, bearerToken);
  }
  if (request.method === "POST") {
    return apiPost(runtime, request.path, request.body ?? {}, bearerToken);
  }
  if (request.method === "PATCH") {
    return apiPatch(runtime, request.path, request.body ?? {}, bearerToken);
  }
  return apiDelete(runtime, request.path, bearerToken);
}

export async function apiGet(runtime: McpExecutionRuntime, path: string, query: Record<string, unknown>, bearerToken: string) {
  const url = new URL(path, runtime.apiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const response = await fetchWith(runtime, url, { headers: authHeaders(bearerToken) });
  if (!response.ok) throw new Error(`API request failed: ${response.status} ${await response.text()}`);
  return readJson(response);
}

export async function apiPost(runtime: McpExecutionRuntime, path: string, body: Record<string, unknown>, bearerToken: string) {
  const response = await fetchWith(runtime, new URL(path, runtime.apiBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(bearerToken) },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`API request failed: ${response.status} ${await response.text()}`);
  return readJson(response);
}

export async function apiPatch(runtime: McpExecutionRuntime, path: string, body: Record<string, unknown>, bearerToken: string) {
  const response = await fetchWith(runtime, new URL(path, runtime.apiBaseUrl), {
    method: "PATCH",
    headers: { "content-type": "application/json", ...authHeaders(bearerToken) },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`API request failed: ${response.status} ${await response.text()}`);
  return readJson(response);
}

export async function apiDelete(runtime: McpExecutionRuntime, path: string, bearerToken: string) {
  const response = await fetchWith(runtime, new URL(path, runtime.apiBaseUrl), {
    method: "DELETE",
    headers: authHeaders(bearerToken)
  });
  if (!response.ok) throw new Error(`API request failed: ${response.status} ${await response.text()}`);
  return readJson(response);
}

function authHeaders(bearerToken: string) {
  return { authorization: `Bearer ${bearerToken}` };
}

function fetchWith(runtime: McpExecutionRuntime, input: URL, init: RequestInit) {
  return (runtime.fetchFn ?? fetch)(input, init);
}

async function readJson(response: Response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}
