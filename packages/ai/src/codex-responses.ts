export function resolveCodexResponsesUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (normalized.endsWith("/codex/responses")) return normalized;
  if (normalized.endsWith("/codex")) return `${normalized}/responses`;
  return `${normalized}/codex/responses`;
}

export function codexInputMessage(payload: unknown) {
  return [{
    type: "message",
    role: "user",
    content: [{ type: "input_text", text: JSON.stringify(payload) }]
  }];
}

export async function readCodexResponseText(response: Response) {
  return extractCodexResponseTextFromBody(await response.text());
}

export function extractCodexResponseTextFromBody(body: string) {
  const trimmed = body.trim();
  if (!trimmed) return "";

  const directJson = parseJson(trimmed);
  if (directJson) return extractCodexResponseText(directJson);

  const events = parseServerSentEvents(trimmed);
  const deltas: string[] = [];
  const fullTexts: string[] = [];
  const completedTexts: string[] = [];

  for (const data of events) {
    if (data === "[DONE]") continue;
    const json = parseJson(data);
    if (!json) continue;
    const type = typeof json.type === "string" ? json.type : "";

    if (typeof json.delta === "string" && type.includes("output_text.delta")) {
      deltas.push(json.delta);
      continue;
    }
    if (typeof json.text === "string" && type.includes("output_text.done")) {
      fullTexts.push(json.text);
      continue;
    }

    const text = extractCodexResponseText(json);
    if (text) {
      if (type === "response.completed") completedTexts.push(text);
      else fullTexts.push(text);
    }
  }

  return completedTexts.at(-1) ?? fullTexts.at(-1) ?? deltas.join("");
}

function extractCodexResponseText(json: Record<string, unknown>) {
  if (typeof json.output_text === "string") return json.output_text;
  if (isRecord(json.response)) return extractCodexResponseText(json.response);

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
  if (parts.length) return parts.join("\n");

  const choices = Array.isArray(json.choices) ? json.choices : [];
  const first = choices.find(isRecord);
  const message = first && isRecord(first.message) ? first.message : null;
  return typeof message?.content === "string" ? message.content : "";
}

function parseServerSentEvents(value: string) {
  return value
    .split(/\r?\n\r?\n/)
    .map((event) => event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart())
      .join("\n")
      .trim())
    .filter(Boolean);
}

function parseJson(value: string) {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
