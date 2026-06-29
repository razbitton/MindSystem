export interface EmbeddingClient {
  embed(input: string): Promise<number[]>;
}

export interface OpenAIEmbeddingClientOptions {
  apiKey?: string;
  apiBaseUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
}

export class OpenAIEmbeddingClient implements EmbeddingClient {
  private readonly apiKey: string;
  private readonly apiBaseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: OpenAIEmbeddingClientOptions) {
    this.apiKey = options.apiKey ?? "";
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.openai.com/v1";
    this.model = options.model ?? "text-embedding-3-small";
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async embed(input: string): Promise<number[]> {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is not configured.");

    const response = await this.fetchFn(new URL("embeddings", ensureTrailingSlash(this.apiBaseUrl)), {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        input,
        encoding_format: "float"
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI embedding failed: ${response.status} ${await response.text()}`);
    }

    const json = (await response.json()) as { data?: { embedding?: number[] }[] };
    const embedding = json.data?.[0]?.embedding;
    if (!embedding?.length) throw new Error("OpenAI embedding response did not include a vector.");
    return embedding;
  }
}

export function vectorToSql(value: number[]) {
  return `[${value.join(",")}]`;
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
