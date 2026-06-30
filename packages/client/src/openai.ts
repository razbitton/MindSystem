import type { MindSystemClient, PrepareTurnContextInput, TurnDeltaInput } from "./index.js";

export interface OpenAIResponsesAdapterOptions {
  mind: MindSystemClient;
  createResponse: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  baseInstructions?: string;
  tools?: unknown[];
}

export async function createMindSystemOpenAIResponse(
  options: OpenAIResponsesAdapterOptions,
  input: PrepareTurnContextInput & {
    model: string;
    openaiInput?: unknown;
    storeTurnDelta?: boolean;
  }
) {
  const context = await options.mind.prepareTurnContext(input);
  const contextMarkdown = stringField(context, "contextMarkdown");
  const response = await options.createResponse({
    model: input.model,
    instructions: [options.baseInstructions, contextMarkdown].filter(Boolean).join("\n\n"),
    input: input.openaiInput ?? input.message,
    tools: options.tools ?? []
  });

  if (input.storeTurnDelta === true) {
    const delta: TurnDeltaInput = {
      userMessage: input.message,
      assistantMessage: extractOpenAIText(response)
    };
    if (input.conversationId) delta.conversationId = input.conversationId;
    if (input.activeProjectId) delta.projectId = input.activeProjectId;
    await options.mind.storeTurnDelta(delta);
  }

  return { response, context };
}

function extractOpenAIText(response: Record<string, unknown>) {
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  const parts: string[] = [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    const content = Array.isArray(item.content) ? item.content : [];
    for (const contentItem of content) {
      if (isRecord(contentItem) && typeof contentItem.text === "string") parts.push(contentItem.text);
    }
  }
  return parts.join("\n");
}

function stringField(record: unknown, key: string) {
  return isRecord(record) && typeof record[key] === "string" ? record[key] as string : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
