import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { runMemoryConsolidationJob } from "./consolidation.js";

describe("runMemoryConsolidationJob", () => {
  it("detects near-duplicate memories during dry runs", async () => {
    const pool = createPool([
      {
        id: "memory-a",
        kind: "decision",
        title: "Launch invite-only decision",
        summary: "Launch should stay invite-only until onboarding is stable.",
        body: "The launch should stay invite-only until onboarding is stable.",
        importance: "high",
        confidence_score: "0.9"
      },
      {
        id: "memory-b",
        kind: "decision",
        title: "Keep launch invite only",
        summary: null,
        body: "The launch should stay invite-only until onboarding is stable.",
        importance: "medium",
        confidence_score: "0.82"
      }
    ]);

    const result = await runMemoryConsolidationJob(pool, {
      workspaceId: "workspace-id",
      dryRun: true,
      limit: 20
    });

    expect(result.duplicateGroups).toBe(1);
    expect(result.reviewItems).toBe(0);
  });
});

function createPool(memoryRows: Record<string, unknown>[]) {
  return {
    query: async (sql: string) => {
      if (sql.includes("stale_after") || sql.includes("expires_at")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("mr.kind = 'preference'")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("from memory_records mr") && sql.includes("order by mr.updated_at desc")) {
        return { rows: memoryRows, rowCount: memoryRows.length };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  } as unknown as Pool;
}
