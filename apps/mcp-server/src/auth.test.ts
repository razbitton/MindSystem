import { describe, expect, it } from "vitest";
import { requireToolScope } from "./auth.js";

describe("requireToolScope", () => {
  it("allows exact scopes and admin", () => {
    expect(() => requireToolScope(["memory:read"], "memory:read")).not.toThrow();
    expect(() => requireToolScope(["admin"], "tasks:write")).not.toThrow();
  });

  it("rejects missing scopes", () => {
    expect(() => requireToolScope(["memory:read"], "tasks:write")).toThrow("Missing required scope");
  });
});
