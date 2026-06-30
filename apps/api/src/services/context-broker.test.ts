import { describe, expect, it } from "vitest";
import { prepareTurnContext } from "./context-broker.js";
import type { AppContext } from "./types.js";

describe("prepareTurnContext", () => {
  it("does not treat recent projects as inferred active context", async () => {
    const context = createContext({ memories: [], recentProjects: [projectRow("recent-project", "Recent project")] });

    const result = await prepareTurnContext(context, {
      message: "What should I focus on?",
      client: "codex"
    });

    expect(result.activeProjects).toEqual([]);
    expect(result.workspaceCandidateProjects).toHaveLength(1);
    expect(result.retrievalTrace.noReliableContext).toBe(true);
    expect(result.contextMarkdown).toContain("## Workspace Candidates");
    expect(result.contextMarkdown).toContain("These are recent projects, not confirmed relevant.");
    expect(result.contextMarkdown).toContain("No reliable stored context was found for this turn.");
  });

  it("returns stale, disputed, and source quote context from recalled memories", async () => {
    const memory = {
      memoryId: "memory-id",
      entityId: "entity-id",
      kind: "decision",
      title: "Launch stays invite-only",
      body: "Launch remains invite-only until onboarding is stable.",
      summary: "Launch remains invite-only.",
      projectId: null,
      validity: "disputed",
      staleAfter: "2020-01-01T00:00:00.000Z",
      sourceQuotes: ["keep launch invite-only"],
      sourceRawItemIds: ["raw-id"],
      score: 0.92,
      keywordRank: 0.3,
      vectorRank: 0
    };
    const context = createContext({ memories: [memory], recentProjects: [] });

    const result = await prepareTurnContext(context, {
      message: "What did we decide about launch?",
      client: "codex"
    });

    expect(result.conflicts).toHaveLength(1);
    expect(result.staleItems).toHaveLength(1);
    expect(result.sourceQuotes[0]).toMatchObject({
      memoryUri: "memory://memory-id",
      rawItemUri: "raw-item://raw-id",
      quote: "keep launch invite-only"
    });
    expect(result.contextMarkdown).toContain("Ask for confirmation before relying on stale or disputed memory.");
  });
});

function createContext(input: { memories: Record<string, unknown>[]; recentProjects: Record<string, unknown>[] }) {
  const pool = {
    query: async (sql: string) => {
      if (sql.includes("from memory_records")) {
        return { rows: input.memories, rowCount: input.memories.length };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => input.recentProjects
          })
        })
      })
    }),
    insert: () => ({
      values: async () => []
    })
  };

  return {
    workspaceId: "00000000-0000-0000-0000-000000000001",
    userId: null,
    env: {
      OPENAI_API_KEY: "",
      OPENAI_API_BASE_URL: "https://api.openai.com/v1",
      OPENAI_EMBEDDING_MODEL: "text-embedding-3-small"
    },
    pool,
    db
  } as unknown as AppContext;
}

function projectRow(id: string, name: string) {
  return {
    id,
    name,
    status: "active",
    priority: "medium",
    description: null,
    goal: null
  };
}
