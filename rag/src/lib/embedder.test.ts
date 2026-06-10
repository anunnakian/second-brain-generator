import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createEmbedder,
  selectEmbedder,
  embedQuery,
  embedTexts,
  GeminiEmbedder,
  type QuotaGuard,
} from "./embedder.js";

// Spies on which quota path is consumed, without touching the network.
class SpyGuard implements QuotaGuard {
  calls: string[] = [];
  consume(): void {
    this.calls.push("index");
  }
  consumePriority(): void {
    this.calls.push("priority");
  }
}

test("GeminiEmbedder exposes its identity (provider/model/dimension) for the stamp", () => {
  const embedder = new GeminiEmbedder({
    usage: new SpyGuard(),
    embedOne: async () => [],
  });

  assert.deepEqual(embedder.identity, {
    providerId: "gemini",
    model: "gemini-embedding-001",
    dimension: 3072,
  });
});

test("createEmbedder(): single selection point → a Gemini Embedder by default", () => {
  assert.equal(createEmbedder().identity.providerId, "gemini");
});

test("createEmbedder() memoizes: the same embedder is shared across calls (hot ONNX session)", () => {
  assert.equal(createEmbedder(), createEmbedder());
});

test("selectEmbedder: provider 'openai-compatible' → stamped OpenAI-compatible adapter", () => {
  const embedder = selectEmbedder({
    EMBEDDING_PROVIDER: "openai-compatible",
    EMBEDDING_BASE_URL: "http://localhost:11434/v1",
    EMBEDDING_API_KEY: "",
    EMBEDDING_MODEL_NAME: "bge-m3",
    EMBEDDING_DIMENSION: "1024",
  });

  assert.deepEqual(embedder.identity, {
    providerId: "openai-compatible",
    model: "bge-m3",
    dimension: 1024,
  });
});

test("selectEmbedder: provider 'in-process' → transformers-js adapter, no URL or key", () => {
  const embedder = selectEmbedder({ EMBEDDING_PROVIDER: "in-process" });

  assert.deepEqual(embedder.identity, {
    providerId: "transformers-js",
    model: "onnx-community/embeddinggemma-300m-ONNX",
    dimension: 768,
  });
});

test("selectEmbedder: 'in-process' accepts a custom model/dimension via the env", () => {
  const embedder = selectEmbedder({
    EMBEDDING_PROVIDER: "in-process",
    EMBEDDING_MODEL_NAME: "Xenova/bge-m3",
    EMBEDDING_DIMENSION: "1024",
  });

  assert.equal(embedder.identity.model, "Xenova/bge-m3");
  assert.equal(embedder.identity.dimension, 1024);
});

test("embedQuery consumes on the priority path (never blocked by indexing)", async () => {
  const guard = new SpyGuard();
  await embedQuery("q", { usage: guard, embedOne: async () => [1, 2, 3] });
  assert.deepEqual(guard.calls, ["priority"]);
});

test("embedTexts consumes on the indexing path, once per text", async () => {
  const guard = new SpyGuard();
  const out = await embedTexts(["a", "b"], {
    usage: guard,
    embedOne: async (t) => [t.length],
  });
  assert.deepEqual(guard.calls, ["index", "index"]);
  assert.deepEqual(out, [[1], [1]]);
});
