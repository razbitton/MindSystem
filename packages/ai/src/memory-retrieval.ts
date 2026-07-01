import type { OpenAICodexToken } from "./memory-extractor.js";
import { codexInputMessage, readCodexResponseText, resolveCodexResponsesUrl } from "./codex-responses.js";

export interface MemorySearchPlan {
  searchQuery: string;
  keywords: string[];
  degraded: boolean;
  error?: string;
}

export interface MemorySearchPlanner {
  plan(input: { query: string; now?: Date }): Promise<MemorySearchPlan>;
}

export interface OpenAICodexMemorySearchPlannerOptions {
  tokenProvider: () => Promise<OpenAICodexToken | null> | OpenAICodexToken | null;
  apiBaseUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
  originator?: string;
}

export class OpenAICodexMemorySearchPlanner implements MemorySearchPlanner {
  private readonly tokenProvider: OpenAICodexMemorySearchPlannerOptions["tokenProvider"];
  private readonly apiBaseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;
  private readonly originator: string;

  constructor(options: OpenAICodexMemorySearchPlannerOptions) {
    this.tokenProvider = options.tokenProvider;
    this.apiBaseUrl = options.apiBaseUrl ?? "https://chatgpt.com/backend-api/codex";
    this.model = options.model ?? "gpt-5.5";
    this.fetchFn = options.fetchFn ?? fetch;
    this.originator = options.originator ?? "personal-context-os";
  }

  async plan(input: { query: string; now?: Date }): Promise<MemorySearchPlan> {
    try {
      const token = await this.tokenProvider();
      if (!token?.accessToken || !token.accountId) {
        return fallbackPlan(input.query, "OpenAI Codex OAuth is not connected.");
      }

      const response = await this.fetchFn(resolveCodexResponsesUrl(this.apiBaseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${token.accessToken}`,
          "chatgpt-account-id": token.accountId,
          originator: this.originator,
          "content-type": "application/json",
          "OpenAI-Beta": "responses=experimental"
        },
        body: JSON.stringify({
          model: this.model,
          store: false,
          stream: true,
          instructions: memorySearchPlanningInstructions(),
          input: codexInputMessage({
            now: (input.now ?? new Date()).toISOString(),
            query: input.query
          }),
          text: {
            format: {
              type: "json_schema",
              name: "memory_search_plan",
              strict: true,
              schema: memorySearchPlanJsonSchema()
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI Codex memory search planning failed: ${response.status} ${await response.text()}`);
      }

      const content = await readCodexResponseText(response);
      if (!content) throw new Error("OpenAI Codex memory search planning returned no content.");
      const parsed = parseSearchPlan(JSON.parse(stripJsonCodeFence(content)), input.query);
      return {
        ...parsed,
        degraded: false
      };
    } catch (error) {
      return fallbackPlan(input.query, error instanceof Error ? error.message : "OpenAI Codex memory search planning failed.");
    }
  }
}

function parseSearchPlan(value: unknown, originalQuery: string): Omit<MemorySearchPlan, "degraded" | "error"> {
  if (!isRecord(value)) return { searchQuery: originalQuery, keywords: [] };
  const keywords = Array.isArray(value.keywords)
    ? value.keywords.filter((keyword): keyword is string => typeof keyword === "string").map((keyword) => keyword.trim()).filter(Boolean)
    : [];
  const searchQuery = typeof value.searchQuery === "string" && value.searchQuery.trim()
    ? value.searchQuery.trim()
    : [originalQuery, ...keywords].join(" ");
  return {
    searchQuery: compactSearchQuery(searchQuery, originalQuery, keywords),
    keywords: unique(keywords).slice(0, 12)
  };
}

function fallbackPlan(query: string, error: string): MemorySearchPlan {
  return {
    searchQuery: query,
    keywords: [],
    degraded: true,
    error
  };
}

function compactSearchQuery(searchQuery: string, originalQuery: string, keywords: string[]) {
  const parts = [originalQuery, searchQuery, ...keywords]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return parts.slice(0, 500);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function memorySearchPlanningInstructions() {
  return [
    "Rewrite a memory recall request into compact text for PostgreSQL full-text and substring search.",
    "Do not answer the user's question.",
    "Return terms that would help find durable memories, projects, tasks, people, decisions, preferences, constraints, and topic notes.",
    "Preserve named entities, project names, people names, dates, and exact domain terms.",
    "When the query mixes Hebrew and English, include useful terms in both languages if obvious.",
    "Prefer concrete nouns and short phrases over prose.",
    "searchQuery must include the original important terms plus helpful synonyms or aliases, max 500 characters.",
    "keywords must contain up to 12 focused terms or phrases.",
    "Return only JSON that matches the requested schema."
  ].join(" ");
}

function memorySearchPlanJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["searchQuery", "keywords"],
    properties: {
      searchQuery: { type: "string" },
      keywords: {
        type: "array",
        maxItems: 12,
        items: { type: "string" }
      }
    }
  };
}

function stripJsonCodeFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
