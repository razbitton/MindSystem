import { describe, expect, it } from "vitest";
import { normalizeEntityTitle } from "./entity-resolution.js";

describe("entity resolution helpers", () => {
  it("normalizes titles for stable lookup keys", () => {
    expect(normalizeEntityTitle("  Launch   Plan  ")).toBe("launch plan");
  });
});
