import { normalizerOutputSchema, type NormalizerOutput } from "@personal-context-os/shared";
import { HeuristicNormalizer } from "./heuristic-normalizer.js";
import type { FreeTextNormalizer } from "./normalizer.js";
import type { OpenAICodexToken } from "./memory-extractor.js";

export interface OpenAINormalizerOptions {
  apiKey?: string;
  apiBaseUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
}

export interface OpenAICodexNormalizerOptions {
  tokenProvider: () => Promise<OpenAICodexToken | null> | OpenAICodexToken | null;
  apiBaseUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
  originator?: string;
}

const entityTypeValues = ["project", "task", "note", "document", "memory", "decision", "reminder", "person", "goal"];
const projectStatusValues = ["active", "paused", "completed", "archived"];
const taskStatusValues = ["inbox", "todo", "in_progress", "waiting", "done", "cancelled"];
const taskKindValues = ["one_off", "ongoing"];
const priorityValues = ["low", "medium", "high", "urgent"];
const relationTypeValues = ["belongs_to", "depends_on", "mentions", "blocks", "derived_from", "related_to"];

export class OpenAINormalizer implements FreeTextNormalizer {
  private readonly apiKey: string;
  private readonly apiBaseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: OpenAINormalizerOptions) {
    this.apiKey = options.apiKey ?? "";
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.openai.com/v1";
    this.model = options.model ?? "gpt-4o-mini";
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async normalize(input: { text: string; now?: Date; projectHint?: string }): Promise<NormalizerOutput> {
    if (!this.apiKey) return fallbackNormalize(input, "OPENAI_API_KEY is not configured.");

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
            { role: "system", content: normalizationInstructions() },
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
              name: "free_text_normalization",
              strict: true,
              schema: normalizerJsonSchema()
            }
          },
          temperature: 0.1
        })
      });

      if (!response.ok) throw new Error(`OpenAI normalization failed: ${response.status} ${await response.text()}`);

      const json = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error("OpenAI normalization returned no content.");
      return parseNormalizerOutput(JSON.parse(content));
    } catch (error) {
      return fallbackNormalize(input, error instanceof Error ? error.message : "OpenAI normalization failed.");
    }
  }
}

export class OpenAICodexNormalizer implements FreeTextNormalizer {
  private readonly tokenProvider: OpenAICodexNormalizerOptions["tokenProvider"];
  private readonly apiBaseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;
  private readonly originator: string;

  constructor(options: OpenAICodexNormalizerOptions) {
    this.tokenProvider = options.tokenProvider;
    this.apiBaseUrl = options.apiBaseUrl ?? "https://chatgpt.com/backend-api/codex";
    this.model = options.model ?? "gpt-5.5";
    this.fetchFn = options.fetchFn ?? fetch;
    this.originator = options.originator ?? "personal-context-os";
  }

  async normalize(input: { text: string; now?: Date; projectHint?: string }): Promise<NormalizerOutput> {
    try {
      const token = await this.tokenProvider();
      if (!token?.accessToken || !token.accountId) return fallbackNormalize(input, "OpenAI Codex OAuth is not connected.");

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
          instructions: normalizationInstructions(),
          input: codexInputMessage({
            now: (input.now ?? new Date()).toISOString(),
            projectHint: input.projectHint ?? null,
            text: input.text
          }),
          text: {
            format: {
              type: "json_schema",
              name: "free_text_normalization",
              strict: true,
              schema: normalizerJsonSchema()
            }
          }
        })
      });

      if (!response.ok) throw new Error(`OpenAI Codex normalization failed: ${response.status} ${await response.text()}`);

      const json = (await response.json()) as Record<string, unknown>;
      const content = extractResponseText(json);
      if (!content) throw new Error("OpenAI Codex normalization returned no content.");
      return parseNormalizerOutput(JSON.parse(stripJsonCodeFence(content)));
    } catch (error) {
      return fallbackNormalize(input, error instanceof Error ? error.message : "OpenAI Codex normalization failed.");
    }
  }
}

async function fallbackNormalize(input: { text: string; now?: Date; projectHint?: string }, reason: string) {
  const normalized = await new HeuristicNormalizer().normalize(input);
  return normalizerOutputSchema.parse({
    ...normalized,
    uncertainties: [
      ...normalized.uncertainties,
      `AI normalizer degraded: ${reason}`
    ]
  });
}

function parseNormalizerOutput(value: unknown) {
  return normalizerOutputSchema.parse(removeNullish(value));
}

function normalizationInstructions() {
  return [
    "Normalize messy free-form user input into structured Personal Context OS entities.",
    "Return JSON only.",
    "Classify concrete work as tasks, durable prose as notes, project-level setup as projects, dates/alerts as reminders, decisions as decisions, outcomes as goals, and people as people.",
    "Durable means it should be useful beyond the current turn. Temporary chatter, greetings, and vague commentary should produce low confidence or no entities.",
    "Prefer tasks for actionable items with verbs. Prefer decisions for chosen direction. Prefer constraints for durable limits only when represented as note custom fields or decisions if the schema has no typed constraint target.",
    "When text mixes Hebrew and English, preserve the user's language in titles and bodies.",
    "Use projectHint as projectTitle unless the text explicitly names a different project.",
    "Do not invent dates. Use ISO datetimes only when the text clearly provides or implies a date.",
    "Confidence rules: high confidence 0.85+ for explicit labels or clear tasks, medium 0.70-0.84 for likely interpretation, low below 0.70 for ambiguous captures.",
    "Examples:",
    "Input: 'Project: Atlas. Decision: keep beta invite-only. Task: draft onboarding by tomorrow.' -> one project, one decision, one task.",
    "Input: 'I like concise technical answers' -> one note or preference-like note with high confidence.",
    "Input: 'interesting' -> no entities or one low-confidence note with uncertainty."
  ].join("\n");
}

function normalizerJsonSchema() {
  const customFields = {
    type: "object",
    additionalProperties: false,
    properties: {
      taskType: { type: ["string", "null"] },
      metadataTags: { type: "array", items: { type: "string" } },
      labels: { type: "array", items: { type: "string" } },
      locale: { type: ["string", "null"] },
      extractionNotes: { type: ["string", "null"] },
      confidenceReason: { type: ["string", "null"] }
    },
    required: []
  };
  const simpleEntity = {
    type: "object",
    additionalProperties: false,
    required: ["title", "body", "projectTitle", "confidence", "customFields"],
    properties: {
      title: { type: "string" },
      body: { type: ["string", "null"] },
      projectTitle: { type: ["string", "null"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      customFields
    }
  };

  return {
    type: "object",
    additionalProperties: false,
    required: [
      "intent",
      "confidence",
      "projects",
      "tasks",
      "notes",
      "reminders",
      "people",
      "decisions",
      "goals",
      "relationships",
      "uncertainties"
    ],
    properties: {
      intent: { type: "string", enum: ["create_project", "add_tasks", "capture_note", "create_reminder", "mixed", "unknown"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      projects: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "description", "goal", "status", "priority", "dueAt", "confidence", "customFields"],
          properties: {
            title: { type: "string" },
            description: { type: ["string", "null"] },
            goal: { type: ["string", "null"] },
            status: { type: "string", enum: projectStatusValues },
            priority: { type: "string", enum: priorityValues },
            dueAt: { type: ["string", "null"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            customFields
          }
        }
      },
      tasks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "description",
            "projectTitle",
            "kind",
            "status",
            "priority",
            "dueAt",
            "scheduledFor",
            "estimateMinutes",
            "assignee",
            "dependsOnTitle",
            "confidence",
            "customFields"
          ],
          properties: {
            title: { type: "string" },
            description: { type: ["string", "null"] },
            projectTitle: { type: ["string", "null"] },
            kind: { type: "string", enum: taskKindValues },
            status: { type: "string", enum: taskStatusValues },
            priority: { type: "string", enum: priorityValues },
            dueAt: { type: ["string", "null"] },
            scheduledFor: { type: ["string", "null"] },
            estimateMinutes: { type: ["number", "null"] },
            assignee: { type: ["string", "null"] },
            dependsOnTitle: { type: ["string", "null"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            customFields
          }
        }
      },
      notes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "body", "projectTitle", "confidence", "customFields"],
          properties: {
            title: { type: "string" },
            body: { type: "string" },
            projectTitle: { type: ["string", "null"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            customFields
          }
        }
      },
      reminders: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "remindAt", "recurrenceRule", "projectTitle", "confidence", "customFields"],
          properties: {
            title: { type: "string" },
            remindAt: { type: ["string", "null"] },
            recurrenceRule: { type: ["string", "null"] },
            projectTitle: { type: ["string", "null"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            customFields
          }
        }
      },
      people: { type: "array", items: simpleEntity },
      decisions: { type: "array", items: simpleEntity },
      goals: { type: "array", items: simpleEntity },
      relationships: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["fromTitle", "fromType", "toTitle", "toType", "relationType", "confidence"],
          properties: {
            fromTitle: { type: "string" },
            fromType: { type: "string", enum: entityTypeValues },
            toTitle: { type: "string" },
            toType: { type: "string", enum: entityTypeValues },
            relationType: { type: "string", enum: relationTypeValues },
            confidence: { type: "number", minimum: 0, maximum: 1 }
          }
        }
      },
      uncertainties: { type: "array", items: { type: "string" } }
    }
  };
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

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function resolveCodexResponsesUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (normalized.endsWith("/codex/responses")) return normalized;
  if (normalized.endsWith("/codex")) return `${normalized}/responses`;
  return `${normalized}/codex/responses`;
}

function codexInputMessage(payload: unknown) {
  return [{
    type: "message",
    role: "user",
    content: [{ type: "input_text", text: JSON.stringify(payload) }]
  }];
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
      if (typeof contentItem.text === "string") parts.push(contentItem.text);
    }
  }
  return parts.join("\n");
}

function stripJsonCodeFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
