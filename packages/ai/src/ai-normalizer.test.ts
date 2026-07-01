import { describe, expect, it } from "vitest";
import { OpenAICodexNormalizer } from "./ai-normalizer.js";

describe("OpenAICodexNormalizer", () => {
  it("sends Responses input as a list-shaped user message", async () => {
    const calls: { body: Record<string, unknown> }[] = [];
    const fetchFn: typeof fetch = async (_input, init) => {
      calls.push({ body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          intent: "capture_note",
          confidence: 0.9,
          projects: [],
          tasks: [],
          notes: [{
            title: "Hebrew summaries",
            body: "The user prefers Hebrew summaries.",
            projectTitle: null,
            confidence: 0.9,
            customFields: {}
          }],
          reminders: [],
          people: [],
          decisions: [],
          goals: [],
          relationships: [],
          uncertainties: []
        })
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const normalizer = new OpenAICodexNormalizer({
      tokenProvider: () => ({ accessToken: "codex-access", accountId: "acct_123" }),
      fetchFn
    });

    const result = await normalizer.normalize({ text: "Preference: write summaries in Hebrew" });

    expect(calls[0]?.body.stream).toBe(true);
    expect(Array.isArray(calls[0]?.body.input)).toBe(true);
    expect(calls[0]?.body.input).toEqual([
      expect.objectContaining({
        type: "message",
        role: "user",
        content: [expect.objectContaining({ type: "input_text" })]
      })
    ]);
    expect(result.notes[0]?.title).toBe("Hebrew summaries");
  });
});
