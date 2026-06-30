export interface MindSystemClientOptions {
  baseUrl: string;
  token: string;
  fetchFn?: typeof fetch;
}

export interface PrepareTurnContextInput {
  message: string;
  conversationId?: string;
  recentMessages?: string[];
  activeProjectId?: string;
  activeEntityIds?: string[];
  client?: "codex" | "claude" | "chatgpt" | "api" | "web" | "mcp" | "other";
  maxTokens?: number;
}

export interface StoreMemoryInput {
  text?: string;
  candidates?: unknown[];
  sourceType?: "web" | "whatsapp" | "openclaw" | "codex" | "api" | "manual";
  projectId?: string;
  rawPayload?: Record<string, unknown>;
}

export interface SupersedeMemoryInput {
  replacement?: unknown;
  text?: string;
  reason?: string;
}

export interface TurnDeltaInput {
  conversationId?: string;
  userMessage: string;
  assistantMessage: string;
  toolCalls?: unknown[];
  projectId?: string;
}

export class MindSystemClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: MindSystemClientOptions) {
    this.baseUrl = options.baseUrl;
    this.token = options.token;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  prepareTurnContext(input: PrepareTurnContextInput) {
    return this.post("/api/context/turn", input);
  }

  recall(input: { query: string; projectId?: string; entityIds?: string[]; limit?: number }) {
    return this.post("/api/memory/recall", input);
  }

  remember(input: StoreMemoryInput) {
    return this.post("/api/memory/store", input);
  }

  supersede(memoryId: string, input: SupersedeMemoryInput) {
    return this.post(`/api/memory/${encodeURIComponent(memoryId)}/supersede`, input);
  }

  projectBrief(projectId: string) {
    return this.get(`/api/projects/${encodeURIComponent(projectId)}/context`);
  }

  async storeTurnDelta(input: TurnDeltaInput) {
    const transcript = [
      `User: ${input.userMessage}`,
      `Assistant: ${input.assistantMessage}`,
      input.toolCalls?.length ? `Tool calls: ${JSON.stringify(input.toolCalls)}` : null
    ].filter(Boolean).join("\n\n");

    const memory: StoreMemoryInput = {
      text: transcript,
      sourceType: "api",
      rawPayload: {
        conversationId: input.conversationId ?? null,
        kind: "turn_delta"
      }
    };
    if (input.projectId) memory.projectId = input.projectId;
    return this.remember(memory);
  }

  private async get(path: string) {
    const response = await this.fetchFn(new URL(path, this.baseUrl), {
      headers: this.authHeaders()
    });
    return readJson(response);
  }

  private async post(path: string, body: unknown) {
    const response = await this.fetchFn(new URL(path, this.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", ...this.authHeaders() },
      body: JSON.stringify(body)
    });
    return readJson(response);
  }

  private authHeaders() {
    return { authorization: `Bearer ${this.token}` };
  }
}

async function readJson(response: Response) {
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `MindSystem request failed: ${response.status}`;
    throw new Error(message);
  }
  return body;
}

export * from "./openai.js";
export * from "./anthropic.js";
