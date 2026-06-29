import { memoryCandidateSchema, type MemoryCandidate } from "@personal-context-os/shared";

export interface MemoryExtractionResult {
  candidates: MemoryCandidate[];
  degraded: boolean;
  error?: string;
}

export interface MemoryExtractor {
  extract(input: {
    text: string;
    now?: Date;
    projectHint?: string;
  }): Promise<MemoryExtractionResult>;
}

export interface OpenAIMemoryExtractorOptions {
  apiKey?: string;
  apiBaseUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
}

export interface OpenAICodexToken {
  accessToken: string;
  accountId: string;
}

export interface OpenAICodexMemoryExtractorOptions {
  tokenProvider: () => Promise<OpenAICodexToken | null> | OpenAICodexToken | null;
  apiBaseUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
  originator?: string;
}

const memoryKindValues = [
  "fact",
  "decision",
  "preference",
  "constraint",
  "commitment",
  "open_question",
  "project_update",
  "person_profile",
  "topic_note"
];

const memoryImportanceValues = ["low", "medium", "high", "critical"];
const relationTypeValues = ["belongs_to", "depends_on", "mentions", "blocks", "derived_from", "related_to"];

export class OpenAIMemoryExtractor implements MemoryExtractor {
  private readonly apiKey: string;
  private readonly apiBaseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: OpenAIMemoryExtractorOptions) {
    this.apiKey = options.apiKey ?? "";
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.openai.com/v1";
    this.model = options.model ?? "gpt-4o-mini";
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async extract(input: { text: string; now?: Date; projectHint?: string }): Promise<MemoryExtractionResult> {
    if (!this.apiKey) {
      return {
        candidates: new HeuristicMemoryExtractor().extractSync(input),
        degraded: true,
        error: "OPENAI_API_KEY is not configured."
      };
    }

    try {
      const response = await this.fetchFn(new URL("chat/completions", ensureTrailingSlash(this.apiBaseUrl)), {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content: [
                "Extract durable memory records for an external AI agent.",
                "Return only information worth remembering beyond the current turn.",
                "Prefer small, atomic records with clear titles and source quotes.",
                "Do not store secrets, passwords, payment data, or private tokens unless the user explicitly asks to remember them.",
                "Use the user's language for titles and bodies when practical."
              ].join(" ")
            },
            {
              role: "user",
              content: JSON.stringify({
                now: (input.now ?? new Date()).toISOString(),
                projectHint: input.projectHint ?? null,
                text: input.text
              })
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "memory_extraction",
              strict: true,
              schema: memoryExtractionJsonSchema()
            }
          },
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI extraction failed: ${response.status} ${await response.text()}`);
      }

      const json = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error("OpenAI extraction returned no content.");
      const parsed = JSON.parse(content) as { candidates?: unknown[] };
      return {
        candidates: parseCandidates(parsed.candidates ?? []),
        degraded: false
      };
    } catch (error) {
      return {
        candidates: new HeuristicMemoryExtractor().extractSync(input),
        degraded: true,
        error: error instanceof Error ? error.message : "Memory extraction failed."
      };
    }
  }
}

export class OpenAICodexMemoryExtractor implements MemoryExtractor {
  private readonly tokenProvider: OpenAICodexMemoryExtractorOptions["tokenProvider"];
  private readonly apiBaseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;
  private readonly originator: string;

  constructor(options: OpenAICodexMemoryExtractorOptions) {
    this.tokenProvider = options.tokenProvider;
    this.apiBaseUrl = options.apiBaseUrl ?? "https://chatgpt.com/backend-api/codex";
    this.model = options.model ?? "gpt-5.5";
    this.fetchFn = options.fetchFn ?? fetch;
    this.originator = options.originator ?? "personal-context-os";
  }

  async extract(input: { text: string; now?: Date; projectHint?: string }): Promise<MemoryExtractionResult> {
    try {
      const token = await this.tokenProvider();
      if (!token?.accessToken || !token.accountId) {
        return {
          candidates: new HeuristicMemoryExtractor().extractSync(input),
          degraded: true,
          error: "OpenAI Codex OAuth is not connected."
        };
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
          stream: false,
          instructions: memoryExtractionInstructions(),
          input: JSON.stringify({
            now: (input.now ?? new Date()).toISOString(),
            projectHint: input.projectHint ?? null,
            text: input.text
          }),
          text: {
            format: {
              type: "json_schema",
              name: "memory_extraction",
              strict: true,
              schema: memoryExtractionJsonSchema()
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI Codex extraction failed: ${response.status} ${await response.text()}`);
      }

      const json = (await response.json()) as Record<string, unknown>;
      const content = extractResponseText(json);
      if (!content) throw new Error("OpenAI Codex extraction returned no content.");
      const parsed = JSON.parse(stripJsonCodeFence(content)) as { candidates?: unknown[] };
      return {
        candidates: parseCandidates(parsed.candidates ?? []),
        degraded: false
      };
    } catch (error) {
      return {
        candidates: new HeuristicMemoryExtractor().extractSync(input),
        degraded: true,
        error: error instanceof Error ? error.message : "OpenAI Codex memory extraction failed."
      };
    }
  }
}

export class HeuristicMemoryExtractor implements MemoryExtractor {
  async extract(input: { text: string; now?: Date; projectHint?: string }): Promise<MemoryExtractionResult> {
    return { candidates: this.extractSync(input), degraded: true, error: "Used heuristic memory extraction." };
  }

  extractSync(input: { text: string; projectHint?: string }) {
    const candidates: MemoryCandidate[] = [];
    const lines = input.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const explicit = /^(fact|decision|preference|constraint|commitment|open question|project update|person|topic|note)\s*[:\-]\s*(.+)$/i.exec(line);
      if (!explicit?.[2]) continue;
      const kind = kindFromLabel(explicit[1] ?? "note");
      candidates.push(memoryCandidateSchema.parse({
        kind,
        title: cleanTitle(explicit[2]),
        body: explicit[2],
        summary: explicit[2].slice(0, 180),
        importance: kind === "decision" || kind === "constraint" ? "high" : "medium",
        confidence: 0.82,
        projectTitle: input.projectHint,
        sourceQuote: line,
        customFields: {}
      }));
    }

    if (candidates.length === 0) {
      const title = cleanTitle(lines[0] ?? input.text).slice(0, 90) || "Memory note";
      candidates.push(memoryCandidateSchema.parse({
        kind: "topic_note",
        title,
        body: input.text,
        summary: input.text.slice(0, 180),
        importance: "medium",
        confidence: input.text.length < 20 ? 0.55 : 0.72,
        projectTitle: input.projectHint,
        sourceQuote: input.text.slice(0, 400),
        customFields: {}
      }));
    }

    return candidates;
  }
}

function parseCandidates(values: unknown[]) {
  return values.map((candidate) => memoryCandidateSchema.parse(removeNullish(candidate)));
}

function removeNullish(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeNullish);
  if (!isRecord(value)) return value;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== null && item !== undefined) next[key] = removeNullish(item);
  }
  return next;
}

function kindFromLabel(label: string): MemoryCandidate["kind"] {
  const normalized = label.toLowerCase().replace(/\s+/g, "_");
  if (normalized === "open_question") return "open_question";
  if (normalized === "project_update") return "project_update";
  if (normalized === "person") return "person_profile";
  if (normalized === "topic" || normalized === "note") return "topic_note";
  if (memoryKindValues.includes(normalized)) return normalized as MemoryCandidate["kind"];
  return "topic_note";
}

function cleanTitle(value: string) {
  return value.replace(/\s+/g, " ").replace(/[.;,]$/, "").trim();
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function resolveCodexResponsesUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (normalized.endsWith("/codex/responses")) return normalized;
  if (normalized.endsWith("/codex")) return `${normalized}/responses`;
  return `${normalized}/codex/responses`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function memoryExtractionInstructions() {
  return [
    "Extract durable memory records for an external AI agent.",
    "Return only information worth remembering beyond the current turn.",
    "Prefer small, atomic records with clear titles and source quotes.",
    "Do not store secrets, passwords, payment data, or private tokens unless the user explicitly asks to remember them.",
    "Use the user's language for titles and bodies when practical.",
    "Return only JSON that matches the requested schema."
  ].join(" ");
}

function extractResponseText(json: Record<string, unknown>) {
  if (typeof json.output_text === "string") return json.output_text;

  const output = Array.isArray(json.output) ? json.output : [];
  const parts: string[] = [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    const content = Array.isArray(item.content) ? item.content : [];
    for (const contentItem of content) {
      if (!isRecord(contentItem)) continue;
      const text = contentItem.text;
      if (typeof text === "string") parts.push(text);
    }
  }
  if (parts.length) return parts.join("\n");

  const choices = Array.isArray(json.choices) ? json.choices : [];
  const first = choices.find(isRecord);
  const message = first && isRecord(first.message) ? first.message : null;
  return typeof message?.content === "string" ? message.content : "";
}

function stripJsonCodeFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function memoryExtractionJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["candidates"],
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "kind",
            "title",
            "body",
            "summary",
            "importance",
            "confidence",
            "projectTitle",
            "relatedEntities",
            "aliases",
            "sourceQuote",
            "occurredAt",
            "customFields"
          ],
          properties: {
            kind: { type: "string", enum: memoryKindValues },
            title: { type: "string" },
            body: { type: "string" },
            summary: { type: ["string", "null"] },
            importance: { type: "string", enum: memoryImportanceValues },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            projectTitle: { type: ["string", "null"] },
            relatedEntities: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["entityId", "entityType", "title", "relationType"],
                properties: {
                  entityId: { type: ["string", "null"] },
                  entityType: { type: ["string", "null"] },
                  title: { type: ["string", "null"] },
                  relationType: { type: "string", enum: relationTypeValues }
                }
              }
            },
            aliases: { type: "array", items: { type: "string" } },
            sourceQuote: { type: ["string", "null"] },
            occurredAt: { type: ["string", "null"] },
            customFields: { type: "object", additionalProperties: false, properties: {}, required: [] }
          }
        }
      }
    }
  };
}
