import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkIndexFreshness,
  shouldStamp,
  staleIndexMessage,
} from "./index-freshness.js";
import type { EmbedderIdentity } from "./vector-store.js";

const gemini: EmbedderIdentity = {
  providerId: "gemini",
  model: "gemini-embedding-001",
  dimension: 3072,
};

test("current identity ≠ stamped identity → stale verdict carrying both", () => {
  const stamped: EmbedderIdentity = {
    providerId: "ollama",
    model: "nomic-embed-text",
    dimension: 768,
  };

  const verdict = checkIndexFreshness(stamped, gemini);

  assert.deepEqual(verdict, { fresh: false, stamped, current: gemini });
});

test("current identity = stamped identity → fresh verdict", () => {
  const verdict = checkIndexFreshness({ ...gemini }, gemini);

  assert.deepEqual(verdict, { fresh: true });
});

test("index with no stamp (from before this plan) → stale, stamped = null", () => {
  const verdict = checkIndexFreshness(null, gemini);

  assert.deepEqual(verdict, { fresh: false, stamped: null, current: gemini });
});

test("reindex force → we (re)stamp (everything is re-encoded with the current embedder)", () => {
  assert.equal(shouldStamp(true, gemini), true);
});

test("incremental on an already-stamped index → we do NOT stamp (no dressing up)", () => {
  assert.equal(shouldStamp(false, gemini), false);
});

test("incremental on an index free of any stamp → we stamp (fresh install / migration)", () => {
  assert.equal(shouldStamp(false, null), true);
});

test("stale message: names both models dynamically + offers the re-index", () => {
  const stamped: EmbedderIdentity = {
    providerId: "gemini",
    model: "gemini-embedding-001",
    dimension: 3072,
  };
  const current: EmbedderIdentity = {
    providerId: "ollama",
    model: "nomic-embed-text",
    dimension: 768,
  };

  const msg = staleIndexMessage(stamped, current);

  assert.ok(msg.includes("gemini-embedding-001"), "names the stamped model");
  assert.ok(msg.includes("nomic-embed-text"), "names the current model");
  assert.match(msg, /re-?index/i);
});

test("stale message with no prior stamp: no \"undefined\", offers the re-index", () => {
  const current: EmbedderIdentity = {
    providerId: "gemini",
    model: "gemini-embedding-001",
    dimension: 3072,
  };

  const msg = staleIndexMessage(null, current);

  assert.ok(!msg.includes("undefined"), "no undefined in the prose");
  assert.ok(msg.includes("gemini-embedding-001"), "names the current model");
  assert.match(msg, /re-?index/i);
});
