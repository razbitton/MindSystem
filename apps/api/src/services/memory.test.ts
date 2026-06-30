import { describe, expect, it } from "vitest";
import { buildMemoryRecallSql } from "./memory.js";

describe("buildMemoryRecallSql", () => {
  it("uses vector ranking when an embedding is available", () => {
    const built = buildMemoryRecallSql("workspace-id", {
      query: "rollout status",
      kinds: ["decision"],
      entityIds: [],
      includeSuperseded: false,
      limit: 5
    }, [0.1, 0.2, 0.3]);

    expect(built.sql).toContain("<=>");
    expect(built.sql).toContain("vector_rank >= 0.58");
    expect(built.sql).toContain("bool_or");
    expect(built.sql).toContain("memory_records");
    expect(built.params).toContain("[0.1,0.2,0.3]");
  });

  it("falls back to full-text and ilike filters without an embedding", () => {
    const built = buildMemoryRecallSql("workspace-id", {
      query: "supplier",
      kinds: [],
      entityIds: [],
      includeSuperseded: false,
      limit: 5
    }, null);

    expect(built.sql).toContain("plainto_tsquery");
    expect(built.sql).toContain("ilike");
    expect(built.params).toContain("supplier");
  });
});
