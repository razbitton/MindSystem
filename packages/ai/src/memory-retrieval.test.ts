import { describe, expect, it, vi } from "vitest";
import { OpenAICodexMemorySearchPlanner } from "./memory-retrieval.js";

describe("OpenAICodexMemorySearchPlanner", () => {
  it("parses Codex Responses output into a search plan", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({
      output_text: JSON.stringify({
        searchQuery: "wedding חתונה vendors",
        keywords: ["wedding", "חתונה", "vendors"]
      })
    }), { status: 200 }));

    const planner = new OpenAICodexMemorySearchPlanner({
      tokenProvider: () => ({ accessToken: "token", accountId: "account" }),
      fetchFn
    });

    const result = await planner.plan({ query: "what do we know about the wedding?" });

    expect(result.degraded).toBe(false);
    expect(result.searchQuery).toContain("what do we know about the wedding?");
    expect(result.searchQuery).toContain("חתונה");
    expect(result.keywords).toEqual(["wedding", "חתונה", "vendors"]);
    expect(fetchFn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      method: "POST"
    }));
  });

  it("falls back to the original query when Codex OAuth is missing", async () => {
    const planner = new OpenAICodexMemorySearchPlanner({
      tokenProvider: () => null
    });

    const result = await planner.plan({ query: "supplier pricing" });

    expect(result).toMatchObject({
      searchQuery: "supplier pricing",
      keywords: [],
      degraded: true,
      error: "OpenAI Codex OAuth is not connected."
    });
  });
});
