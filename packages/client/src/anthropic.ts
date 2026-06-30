import type { MindSystemClient, PrepareTurnContextInput, TurnDeltaInput } from "./index.js";

export interface AnthropicAdapterOptions {
  mind: MindSystemClient;
  createMessage: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  system?: string;
  tools?: unknown[];
}

export async function createMindSystemAnthropicMessage(
  options: AnthropicAdapterOptions,
  input: PrepareTurnContextInput & {
    model: string;
    messages?: unknown[];
    maxTokens?: number;
    storeTurnDelta?: boolean;
  }
) {
  const context = await options.mind.prepareTurnContext(input);
  const contextMarkdown = stringField(context, "contextMarkdown");
  const response = await options.createMessage({
    model: input.model,
    max_tokens: input.maxTokens ?? 4096,
    system: [options.system, contextMarkdown].filter(Boolean).join("\n\n"),
    messages: input.messages ?? [{ role: "user", content: input.message }],
    tools: options.tools ?? []
  });

  if (input.storeTurnDelta === true) {
    const delta: TurnDeltaInput = {
      userMessage: input.message,
      assistantMessage: extractAnthropicText(response)
    };
    if (input.conversationId) delta.conversationId = input.conversationId;
    if (input.activeProjectId) delta.projectId = input.activeProjectId;
    await options.mind.storeTurnDelta(delta);
  }

  return { response, context };
}

function extractAnthropicText(response: Record<string, unknown>) {
  const content = Array.isArray(response.content) ? response.content : [];
  return content
    .map((item) => isRecord(item) && typeof item.text === "string" ? item.text : "")
    .filter(Boolean)
    .join("\n");
}

function stringField(record: unknown, key: string) {
  return isRecord(record) && typeof record[key] === "string" ? record[key] as string : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
