import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { DbClient } from "@personal-context-os/db";
import { registerMcpRoutes } from "./routes.js";

describe("MCP route bootstrap", () => {
  it("returns agent memory instructions during initialize", async () => {
    const app = Fastify();
    await registerMcpRoutes(app, { db: {} as DbClient, apiBaseUrl: "http://api.test" });

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.result.instructions).toContain("Personal Context OS Agent Bootstrap");
    expect(body.result.instructions).toContain("get_relevant_context");

    await app.close();
  });

  it("lists only default-tier tools unless a broader tier is requested", async () => {
    const app = Fastify();
    await registerMcpRoutes(app, { db: {} as DbClient, apiBaseUrl: "http://api.test" });

    const defaultResponse = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }
    });
    const defaultNames = defaultResponse.json().result.tools.map((tool: { name: string }) => tool.name);
    expect(defaultNames).toContain("prepare_turn_context");
    expect(defaultNames).toContain("project_brief");
    expect(defaultNames).not.toContain("get_relevant_context");
    expect(defaultNames).not.toContain("purge_workspace_data");

    const advancedResponse = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: { jsonrpc: "2.0", id: 2, method: "tools/list", params: { tier: "advanced" } }
    });
    const advancedNames = advancedResponse.json().result.tools.map((tool: { name: string }) => tool.name);
    expect(advancedNames).toContain("prepare_turn_context");
    expect(advancedNames).toContain("get_relevant_context");
    expect(advancedNames).not.toContain("purge_workspace_data");

    await app.close();
  });

  it("requires an agent token before listing admin-tier tools", async () => {
    const app = Fastify();
    await registerMcpRoutes(app, { db: {} as DbClient, apiBaseUrl: "http://api.test" });

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: { tier: "admin" } }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toContain("Agent token required");

    await app.close();
  });
});
