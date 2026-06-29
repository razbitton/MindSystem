import { describe, expect, it } from "vitest";
import { HeuristicMemoryExtractor, OpenAICodexMemoryExtractor, OpenAIMemoryExtractor } from "./memory-extractor.js";

describe("memory extractors", () => {
  it("extracts explicit durable memories with the heuristic fallback", async () => {
    const extractor = new HeuristicMemoryExtractor();
    const result = await extractor.extract({
      text: "Decision: keep beta small\nPreference: write summaries in Hebrew"
    });

    expect(result.degraded).toBe(true);
    expect(result.candidates.map((candidate) => candidate.kind)).toEqual(["decision", "preference"]);
  });

  it("uses the OpenAI-compatible structured output endpoint", async () => {
    const calls: string[] = [];
    const fetchFn: typeof fetch = async (input) => {
      calls.push(input instanceof URL ? input.toString() : String(input));
      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                candidates: [
                  {
                    kind: "fact",
                    title: "Supplier pricing pending",
                    body: "Supplier pricing still needs confirmation.",
                    summary: "Supplier pricing still needs confirmation.",
                    importance: "high",
                    confidence: 0.91,
                    projectTitle: null,
                    relatedEntities: [],
                    aliases: [],
                    sourceQuote: "Supplier pricing still needs confirmation.",
                    occurredAt: null,
                    customFields: {}
                  }
                ]
              })
            }
          }
        ]
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const extractor = new OpenAIMemoryExtractor({
      apiKey: "test-key",
      apiBaseUrl: "https://api.openai.test/v1",
      model: "test-model",
      fetchFn
    });
    const result = await extractor.extract({ text: "Supplier pricing still needs confirmation." });

    expect(calls[0]).toBe("https://api.openai.test/v1/chat/completions");
    expect(result.degraded).toBe(false);
    expect(result.candidates[0]?.title).toBe("Supplier pricing pending");
  });

  it("uses the ChatGPT Codex Responses backend with account headers", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      calls.push({
        url: input instanceof URL ? input.toString() : String(input),
        headers: init?.headers as Record<string, string>
      });
      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          candidates: [
            {
              kind: "preference",
              title: "Hebrew summaries",
              body: "The user prefers summaries in Hebrew.",
              summary: "The user prefers summaries in Hebrew.",
              importance: "medium",
              confidence: 0.9,
              projectTitle: null,
              relatedEntities: [],
              aliases: [],
              sourceQuote: "Preference: write summaries in Hebrew",
              occurredAt: null,
              customFields: {}
            }
          ]
        })
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const extractor = new OpenAICodexMemoryExtractor({
      tokenProvider: () => ({ accessToken: "codex-access", accountId: "acct_123" }),
      apiBaseUrl: "https://chatgpt.com/backend-api",
      model: "gpt-5.5",
      fetchFn
    });
    const result = await extractor.extract({ text: "Preference: write summaries in Hebrew" });

    expect(calls[0]?.url).toBe("https://chatgpt.com/backend-api/codex/responses");
    expect(calls[0]?.headers.authorization).toBe("Bearer codex-access");
    expect(calls[0]?.headers["chatgpt-account-id"]).toBe("acct_123");
    expect(result.degraded).toBe(false);
    expect(result.candidates[0]?.kind).toBe("preference");
  });
});
