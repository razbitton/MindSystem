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
});
