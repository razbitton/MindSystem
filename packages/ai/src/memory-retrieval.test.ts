import { describe, expect, it } from "vitest";
import { OpenAICodexMemorySearchPlanner } from "./memory-retrieval.js";

describe("OpenAICodexMemorySearchPlanner", () => {
  it("parses Codex Responses output into a search plan", async () => {
    const calls: { body: Record<string, unknown>; method?: string }[] = [];
    const fetchFn: typeof fetch = async (_input, init) => {
      const call: { body: Record<string, unknown>; method?: string } = {
        body: JSON.parse(String(init?.body))
      };
      if (init?.method) call.method = init.method;
      calls.push(call);
      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          searchQuery: "wedding חתונה vendors",
          keywords: ["wedding", "חתונה", "vendors"]
        })
      }), { status: 200 });
    };

    const planner = new OpenAICodexMemorySearchPlanner({
      tokenProvider: () => ({ accessToken: "token", accountId: "account" }),
      fetchFn
    });

    const result = await planner.plan({ query: "what do we know about the wedding?" });
    const body = calls[0]?.body ?? {};

    expect(result.degraded).toBe(false);
    expect(result.searchQuery).toContain("what do we know about the wedding?");
    expect(result.searchQuery).toContain("חתונה");
    expect(result.keywords).toEqual(["wedding", "חתונה", "vendors"]);
    expect(calls[0]?.method).toBe("POST");
    const input = body.input;
    expect(Array.isArray(input)).toBe(true);
    if (!Array.isArray(input)) throw new Error("Expected Codex input to be an array.");
    expect(input[0]).toMatchObject({
      type: "message",
      role: "user",
      content: [{ type: "input_text" }]
    });
    const message = input[0] as { content: { text: string }[] };
    expect(JSON.parse(message.content[0]?.text ?? "{}")).toMatchObject({
      query: "what do we know about the wedding?"
    });
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
