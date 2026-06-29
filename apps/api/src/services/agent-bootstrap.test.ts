import { describe, expect, it } from "vitest";
import type { AppContext } from "./types.js";
import { getAgentBootstrap } from "./agent-bootstrap.js";

describe("agent bootstrap", () => {
  it("returns memory workflow instructions and endpoint hints", () => {
    const context = {
      env: {
        API_BASE_URL: "http://api.test",
        MCP_SERVER_URL: "http://mcp.test/mcp"
      }
    } as AppContext;

    const bootstrap = getAgentBootstrap(context);

    expect(bootstrap.instructions).toContain("get_relevant_context");
    expect(bootstrap.memoryPolicy).toContain("Agent Memory Policy");
    expect(bootstrap.api.bootstrapEndpoint).toBe("/api/agents/bootstrap");
    expect(bootstrap.primaryTools.map((tool) => tool.name)).toContain("store_memory");
  });
});
