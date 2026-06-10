import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inProcessAvailable,
  recommendedEmbedderKey,
  buildEmbedderOptions,
  envConfigForEmbedder,
  embedderReady,
} from "./embedder-choice.mjs";

const GiB = 1024 ** 3;

test("inProcessAvailable — false on Mac Intel (darwin/x64, ONNX not covered)", () => {
  assert.equal(inProcessAvailable({ platform: "darwin", arch: "x64" }), false);
});

test("inProcessAvailable — true elsewhere (Apple Silicon, Windows, Linux)", () => {
  assert.equal(inProcessAvailable({ platform: "darwin", arch: "arm64" }), true);
  assert.equal(inProcessAvailable({ platform: "win32", arch: "x64" }), true);
  assert.equal(inProcessAvailable({ platform: "linux", arch: "x64" }), true);
});

test("recommendedEmbedderKey — Mac Intel → api (in-process unavailable)", () => {
  assert.equal(
    recommendedEmbedderKey({ platform: "darwin", arch: "x64", totalMemBytes: 32 * GiB }),
    "api",
  );
});

test("recommendedEmbedderKey — capable machine (≥ 12 GB, Apple Silicon) → in-process", () => {
  assert.equal(
    recommendedEmbedderKey({ platform: "darwin", arch: "arm64", totalMemBytes: 16 * GiB }),
    "in-process",
  );
});

test("recommendedEmbedderKey — small machine (< 12 GB) → api even if in-process available", () => {
  assert.equal(
    recommendedEmbedderKey({ platform: "win32", arch: "x64", totalMemBytes: 8 * GiB }),
    "api",
  );
});

test("recommendedEmbedderKey — threshold at exactly 12 GB → in-process", () => {
  assert.equal(
    recommendedEmbedderKey({ platform: "win32", arch: "x64", totalMemBytes: 12 * GiB }),
    "in-process",
  );
});

test("buildEmbedderOptions — capable machine: 3 options (privacy order), in-process ⭐", () => {
  const opts = buildEmbedderOptions({ platform: "darwin", arch: "arm64", totalMemBytes: 16 * GiB });
  assert.deepEqual(
    opts.map((o) => o.key),
    ["in-process", "api", "ollama"],
  );
  assert.deepEqual(
    opts.map((o) => o.num),
    [1, 2, 3],
  );
  assert.deepEqual(
    opts.map((o) => o.recommended),
    [true, false, false],
  );
});

test("buildEmbedderOptions — Mac Intel: in-process hidden, renumbered, api ⭐", () => {
  const opts = buildEmbedderOptions({ platform: "darwin", arch: "x64", totalMemBytes: 32 * GiB });
  assert.deepEqual(
    opts.map((o) => o.key),
    ["api", "ollama"],
  );
  assert.deepEqual(
    opts.map((o) => o.num),
    [1, 2],
  );
  assert.equal(opts.find((o) => o.key === "api").recommended, true);
});

test("buildEmbedderOptions — small capable machine: api ⭐ but in-process stays listed", () => {
  const opts = buildEmbedderOptions({ platform: "win32", arch: "x64", totalMemBytes: 8 * GiB });
  assert.deepEqual(
    opts.map((o) => o.key),
    ["in-process", "api", "ollama"],
  );
  assert.equal(opts.find((o) => o.key === "api").recommended, true);
  assert.equal(opts.find((o) => o.key === "in-process").recommended, false);
});

test("envConfigForEmbedder — in-process: EMBEDDING_PROVIDER=in-process, no Gemini key", () => {
  const cfg = envConfigForEmbedder("in-process");
  assert.deepEqual(cfg.lines, ["EMBEDDING_PROVIDER=in-process"]);
  assert.equal(cfg.needsGeminiKey, false);
});

test("envConfigForEmbedder — gemini: no provider line (default), Gemini key required", () => {
  const cfg = envConfigForEmbedder("gemini");
  assert.deepEqual(cfg.lines, []);
  assert.equal(cfg.needsGeminiKey, true);
});

test("envConfigForEmbedder — openai-compatible: URL/model/dimension from the details", () => {
  const cfg = envConfigForEmbedder("openai-compatible", {
    baseURL: "https://api.openai.com/v1",
    model: "text-embedding-3-small",
    dimension: 1536,
  });
  assert.deepEqual(cfg.lines, [
    "EMBEDDING_PROVIDER=openai-compatible",
    "EMBEDDING_BASE_URL=https://api.openai.com/v1",
    "EMBEDDING_MODEL_NAME=text-embedding-3-small",
    "EMBEDDING_DIMENSION=1536",
  ]);
  assert.equal(cfg.needsGeminiKey, false);
});

test("envConfigForEmbedder — ollama: openai-compatible to localhost, embeddinggemma defaults", () => {
  const cfg = envConfigForEmbedder("ollama");
  assert.deepEqual(cfg.lines, [
    "EMBEDDING_PROVIDER=openai-compatible",
    "EMBEDDING_BASE_URL=http://localhost:11434/v1",
    "EMBEDDING_MODEL_NAME=embeddinggemma",
    "EMBEDDING_DIMENSION=768",
  ]);
  assert.equal(cfg.needsGeminiKey, false);
});

test("envConfigForEmbedder — ollama: model/dimension overridable", () => {
  const cfg = envConfigForEmbedder("ollama", { model: "bge-m3", dimension: 1024 });
  assert.equal(cfg.lines.includes("EMBEDDING_MODEL_NAME=bge-m3"), true);
  assert.equal(cfg.lines.includes("EMBEDDING_DIMENSION=1024"), true);
});

test("envConfigForEmbedder — unknown key: fails loudly (no silent config)", () => {
  assert.throws(() => envConfigForEmbedder("bogus"), /bogus/);
});

test("embedderReady — Gemini: ready only if the key is present", () => {
  assert.equal(embedderReady("GOOGLE_GEMINI_API_KEY=AIza\n"), true);
  assert.equal(embedderReady("QUERY_RESERVE=50\n"), false);
  assert.equal(embedderReady(null), false);
});

test("embedderReady — in-process: always ready (weights downloaded on first use)", () => {
  assert.equal(embedderReady("EMBEDDING_PROVIDER=in-process\n"), true);
});

test("embedderReady — openai-compatible: ready if a base URL is provided", () => {
  assert.equal(
    embedderReady("EMBEDDING_PROVIDER=openai-compatible\nEMBEDDING_BASE_URL=http://localhost:11434/v1\n"),
    true,
  );
  assert.equal(embedderReady("EMBEDDING_PROVIDER=openai-compatible\nEMBEDDING_BASE_URL=\n"), false);
});
