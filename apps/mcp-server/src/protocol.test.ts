import { describe, expect, it } from "vitest";
import { isAcceptedClientNotification } from "./protocol.js";

describe("MCP protocol helpers", () => {
  it("accepts client notifications without JSON-RPC ids", () => {
    expect(isAcceptedClientNotification({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })).toBe(true);
  });

  it("does not classify normal requests as notifications", () => {
    expect(isAcceptedClientNotification({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })).toBe(false);
  });

  it("does not accept malformed messages", () => {
    expect(isAcceptedClientNotification(null)).toBe(false);
    expect(isAcceptedClientNotification([])).toBe(false);
    expect(isAcceptedClientNotification({ method: "tools/list" })).toBe(false);
  });
});
