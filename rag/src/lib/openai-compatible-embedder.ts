import type { Embedder, EmbedderIdentity } from "./embedder.js";

/** Config of the OpenAI-compatible adapter (URL + key + model + dimension). */
export interface OpenAiCompatibleConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  dimension: number;
}

/** Minimal HTTP response the adapter needs (subset of `fetch`). */
export interface EmbeddingResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

/** Injectable `fetch`-like: isolates the adapter from the network to test it. */
export type EmbeddingFetch = (
  url: string,
  init: RequestInit
) => Promise<EmbeddingResponse>;

/** OpenAI-compatible response envelope: `{ data: [{ embedding: [...] }] }`. */
interface OpenAiEmbeddingPayload {
  data?: { embedding: number[] }[];
}

/**
 * Adapter for the `Embedder` port speaking the "OpenAI-compatible Esperanto" (ADR
 * 0007 §3): `{ model, input }` → `{ data: [{ embedding }] }`. A single adapter
 * covers OpenAI, Azure, an enterprise gateway, Mistral, and local via Ollama
 * (`http://localhost:11434/v1`) — you switch backend by changing a URL/key.
 */
export class OpenAiCompatibleEmbedder implements Embedder {
  readonly identity: EmbedderIdentity;

  constructor(
    private readonly config: OpenAiCompatibleConfig,
    private readonly fetchFn: EmbeddingFetch = globalThis.fetch as EmbeddingFetch
  ) {
    this.identity = {
      providerId: "openai-compatible",
      model: config.model,
      dimension: config.dimension,
    };
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embed(texts);
  }

  async embedQuery(text: string): Promise<number[]> {
    const vectors = await this.embed(text);
    return vectors[0];
  }

  /** One `/embeddings` round-trip: `input` accepts a text or a batch (OpenAI dialect). */
  private async embed(input: string | string[]): Promise<number[][]> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    // Empty key = local (Ollama), no auth; otherwise Bearer (OpenAI/Azure/gateway).
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    const response = await this.fetchFn(`${this.config.baseURL}/embeddings`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: this.config.model, input }),
    });
    if (!response.ok) {
      // Loud failure: we NEVER return a silent empty vector (which would poison
      // the index). The HTTP status guides the diagnosis (401 = key, 404 =
      // URL/model, etc.).
      throw new Error(
        `Embedding endpoint ${this.config.baseURL} responded ${response.status} ` +
          `(model ${this.config.model}).`
      );
    }
    const payload = (await response.json()) as OpenAiEmbeddingPayload;
    return (payload.data ?? []).map((d) => d.embedding);
  }
}
