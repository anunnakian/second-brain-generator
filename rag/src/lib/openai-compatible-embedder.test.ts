import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OpenAiCompatibleEmbedder,
  type EmbeddingFetch,
} from "./openai-compatible-embedder.js";

// Captures the outgoing HTTP request and returns a canonical OpenAI response,
// without touching the network. `vectors` = what the fake endpoint returns, in order.
function fakeFetch(vectors: number[][]): {
  fetch: EmbeddingFetch;
  calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: EmbeddingFetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: vectors.map((embedding) => ({ embedding })) }),
    };
  };
  return { fetch, calls };
}

test("identity (provider/model/dimension) populated from the config — the stamp key", () => {
  const embedder = new OpenAiCompatibleEmbedder({
    baseURL: "http://localhost:11434/v1",
    apiKey: "",
    model: "bge-m3",
    dimension: 1024,
  });

  assert.deepEqual(embedder.identity, {
    providerId: "openai-compatible",
    model: "bge-m3",
    dimension: 1024,
  });
});

test("embedQuery: POST { model, input } to <baseURL>/embeddings, reads data[0].embedding", async () => {
  const { fetch, calls } = fakeFetch([[0.1, 0.2, 0.3]]);
  const embedder = new OpenAiCompatibleEmbedder(
    {
      baseURL: "http://localhost:11434/v1",
      apiKey: "",
      model: "bge-m3",
      dimension: 3,
    },
    fetch
  );

  const vector = await embedder.embedQuery("a question");

  assert.deepEqual(vector, [0.1, 0.2, 0.3]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:11434/v1/embeddings");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body as string), {
    model: "bge-m3",
    input: "a question",
  });
});

test("embedDocuments: sends the batch as input[], reads data[].embedding in order", async () => {
  const { fetch, calls } = fakeFetch([
    [1, 0],
    [0, 1],
  ]);
  const embedder = new OpenAiCompatibleEmbedder(
    {
      baseURL: "http://localhost:11434/v1",
      apiKey: "",
      model: "bge-m3",
      dimension: 2,
    },
    fetch
  );

  const vectors = await embedder.embedDocuments(["doc A", "doc B"]);

  assert.deepEqual(vectors, [
    [1, 0],
    [0, 1],
  ]);
  assert.deepEqual(JSON.parse(calls[0].init.body as string).input, [
    "doc A",
    "doc B",
  ]);
});

test("key present (API endpoint) → Authorization: Bearer <key> header", async () => {
  const { fetch, calls } = fakeFetch([[1]]);
  const embedder = new OpenAiCompatibleEmbedder(
    {
      baseURL: "https://api.openai.com/v1",
      apiKey: "sk-secret",
      model: "text-embedding-3-small",
      dimension: 1,
    },
    fetch
  );

  await embedder.embedQuery("q");

  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer sk-secret");
});

test("empty key (local Ollama) → NO Authorization header", async () => {
  const { fetch, calls } = fakeFetch([[1]]);
  const embedder = new OpenAiCompatibleEmbedder(
    {
      baseURL: "http://localhost:11434/v1",
      apiKey: "",
      model: "bge-m3",
      dimension: 1,
    },
    fetch
  );

  await embedder.embedQuery("q");

  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal("Authorization" in headers, false);
});

test("non-ok HTTP response → clear error (status visible), not a silent empty vector", async () => {
  const failingFetch: EmbeddingFetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: { message: "invalid key" } }),
  });
  const embedder = new OpenAiCompatibleEmbedder(
    {
      baseURL: "https://api.openai.com/v1",
      apiKey: "bad",
      model: "text-embedding-3-small",
      dimension: 1,
    },
    failingFetch
  );

  await assert.rejects(() => embedder.embedQuery("q"), /401/);
});
