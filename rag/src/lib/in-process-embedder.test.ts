import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InProcessEmbedder,
  promptsForModel,
  EMBED_BATCH,
  type FeatureExtractor,
} from "./in-process-embedder.js";

// Fake extractor (the Transformers.js pipeline, without downloading the weights):
// captures the calls and returns a tensor-like whose `tolist()` yields the wanted vectors.
function fakeExtractor(vectors: number[][]): {
  load: () => Promise<FeatureExtractor>;
  calls: { input: string | string[]; opts: unknown }[];
} {
  const calls: { input: string | string[]; opts: unknown }[] = [];
  const extractor: FeatureExtractor = async (input, opts) => {
    calls.push({ input, opts });
    return { tolist: () => vectors };
  };
  return { load: async () => extractor, calls };
}

test("identity (provider/model/dimension) populated from the config — the stamp key", () => {
  const embedder = new InProcessEmbedder({
    model: "onnx-community/embeddinggemma-300m-ONNX",
    dimension: 768,
  });

  assert.deepEqual(embedder.identity, {
    providerId: "transformers-js",
    model: "onnx-community/embeddinggemma-300m-ONNX",
    dimension: 768,
  });
});

test("embedQuery: mean pooling + normalization via the extractor, returns the 1st vector", async () => {
  const { load, calls } = fakeExtractor([[0.1, 0.2, 0.3]]);
  const embedder = new InProcessEmbedder(
    { model: "m", dimension: 3 },
    load
  );

  const vector = await embedder.embedQuery("a question");

  assert.deepEqual(vector, [0.1, 0.2, 0.3]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].opts, { pooling: "mean", normalize: true });
});

test("embedDocuments: encodes the batch and returns the vectors in order", async () => {
  const { load, calls } = fakeExtractor([
    [1, 0],
    [0, 1],
  ]);
  const embedder = new InProcessEmbedder({ model: "m", dimension: 2 }, load);

  const vectors = await embedder.embedDocuments(["doc A", "doc B"]);

  assert.deepEqual(vectors, [
    [1, 0],
    [0, 1],
  ]);
  assert.deepEqual(calls[0].input, ["doc A", "doc B"]);
});

test("embedDocuments: caps the batch size — splits into bounded sub-batches, concatenates in order", async () => {
  // Fake that returns one vector per input text (numeric echo), and captures
  // each sub-batch received: proves both the splitting and the output order.
  const calls: string[][] = [];
  const load: () => Promise<FeatureExtractor> = async () => async (input) => {
    const slice = input as string[];
    calls.push(slice);
    return { tolist: () => slice.map((s) => [Number(s)]) };
  };
  const embedder = new InProcessEmbedder(
    { model: "m", dimension: 1, batchSize: 2 },
    load
  );

  const vectors = await embedder.embedDocuments(["1", "2", "3", "4", "5"]);

  // 5 texts, batch capped at 2 → 3 sub-batches: [1,2] [3,4] [5]
  assert.deepEqual(calls, [["1", "2"], ["3", "4"], ["5"]]);
  // vectors reconcatenated in their original order (nothing lost or shuffled)
  assert.deepEqual(vectors, [[1], [2], [3], [4], [5]]);
});

test("embedDocuments: with no batchSize configured, applies the default cap EMBED_BATCH (prod path)", async () => {
  const calls: string[][] = [];
  const load: () => Promise<FeatureExtractor> = async () => async (input) => {
    const slice = input as string[];
    calls.push(slice);
    return { tolist: () => slice.map(() => [0]) };
  };
  // selectEmbedder builds the adapter WITHOUT batchSize → the default is what must protect.
  const embedder = new InProcessEmbedder({ model: "m", dimension: 1 }, load);

  const texts = Array.from({ length: EMBED_BATCH + 1 }, (_, i) => String(i));
  await embedder.embedDocuments(texts);

  // one more than the cap → 2 sub-batches, the 1st full
  assert.equal(calls.length, 2);
  assert.equal(calls[0].length, EMBED_BATCH);
  assert.equal(calls[1].length, 1);
});

test("model loading fails → clear error (model named), never an empty vector", async () => {
  const load: () => Promise<FeatureExtractor> = async () => {
    throw new Error("offline: download failed");
  };
  const embedder = new InProcessEmbedder(
    { model: "onnx-community/embeddinggemma-300m-ONNX", dimension: 768 },
    load
  );

  await assert.rejects(
    () => embedder.embedQuery("q"),
    /embeddinggemma-300m-ONNX/
  );
});

test("prompts configured: embedQuery prefixes the question (EmbeddingGemma requires a task prompt)", async () => {
  const { load, calls } = fakeExtractor([[1]]);
  const embedder = new InProcessEmbedder(
    {
      model: "embeddinggemma",
      dimension: 1,
      prompts: { query: "task: search result | query: ", document: "title: none | text: " },
    },
    load
  );

  await embedder.embedQuery("Flemmr's slogan");

  assert.deepEqual(calls[0].input, ["task: search result | query: Flemmr's slogan"]);
});

test("prompts configured: embedDocuments prefixes each document", async () => {
  const { load, calls } = fakeExtractor([
    [1],
    [1],
  ]);
  const embedder = new InProcessEmbedder(
    {
      model: "embeddinggemma",
      dimension: 1,
      prompts: { query: "task: search result | query: ", document: "title: none | text: " },
    },
    load
  );

  await embedder.embedDocuments(["doc A", "doc B"]);

  assert.deepEqual(calls[0].input, [
    "title: none | text: doc A",
    "title: none | text: doc B",
  ]);
});

test("without prompts: raw text (bge-m3-type models don't want any)", async () => {
  const { load, calls } = fakeExtractor([[1]]);
  const embedder = new InProcessEmbedder({ model: "bge-m3", dimension: 1 }, load);

  await embedder.embedQuery("brut");

  assert.deepEqual(calls[0].input, ["brut"]);
});

test("promptsForModel: EmbeddingGemma → query/document task prompts; bge-m3 → none", () => {
  const gemma = promptsForModel("onnx-community/embeddinggemma-300m-ONNX");
  assert.deepEqual(gemma, {
    query: "task: search result | query: ",
    document: "title: none | text: ",
  });

  assert.equal(promptsForModel("Xenova/bge-m3"), undefined);
});

test("the pipeline is loaded only once (expensive model), reused across calls", async () => {
  let loads = 0;
  const load: () => Promise<FeatureExtractor> = async () => {
    loads++;
    return async () => ({ tolist: () => [[1]] });
  };
  const embedder = new InProcessEmbedder({ model: "m", dimension: 1 }, load);

  await embedder.embedQuery("a");
  await embedder.embedDocuments(["b", "c"]);
  await embedder.embedQuery("d");

  assert.equal(loads, 1);
});
