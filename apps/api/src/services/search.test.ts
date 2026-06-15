import { describe, expect, it } from "vitest";
import { buildSearchSql } from "./search.js";

describe("buildSearchSql", () => {
  it("includes structured filters and full-text search", () => {
    const built = buildSearchSql("workspace-id", {
      q: "launch",
      entity_type: "task",
      project_id: "00000000-0000-0000-0000-000000000001",
      status: "todo",
      limit: 10
    });

    expect(built.sql).toContain("plainto_tsquery");
    expect(built.sql).toContain("e.entity_type");
    expect(built.sql).toContain("t.project_id");
    expect(built.params).toContain("launch");
  });
});
