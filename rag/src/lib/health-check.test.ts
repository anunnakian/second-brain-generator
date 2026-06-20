import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHealthCheck, gatherVitals, runHealthCheck, type HealthVitals } from "./health-check.js";

const HEALTHY: HealthVitals = {
  embedderMode: "in-process",
  keyConfigured: true,
  embedderReady: true,
  indexRows: 42,
  canaryHits: 3,
};

function checkNamed(result: { checks: { name: string; status: string }[] }, name: string) {
  const entry = result.checks.find((c) => c.name === name);
  assert.ok(entry, `expected a "${name}" check`);
  return entry;
}

test("all vitals healthy → aggregate status ok, every check ok", () => {
  const result = buildHealthCheck(HEALTHY);
  assert.equal(result.status, "ok");
  assert.ok(result.checks.length >= 3);
  assert.ok(result.checks.every((c) => c.status === "ok"));
});

test("embedder ran but canary not found → canary broken, aggregate broken", () => {
  const result = buildHealthCheck({ ...HEALTHY, embedderReady: true, canaryHits: 0 });
  assert.equal(checkNamed(result, "canary").status, "broken");
  assert.equal(result.status, "broken");
});

test("embedder could not run → canary unknown (not broken), embedder broken", () => {
  const result = buildHealthCheck({ ...HEALTHY, embedderReady: false, canaryHits: 0 });
  // We cannot conclude the RAG is broken when the search itself never ran.
  assert.equal(checkNamed(result, "canary").status, "unknown");
  assert.equal(checkNamed(result, "embedder").status, "broken");
});

test("index unreadable (rows < 0) → index unknown, not broken", () => {
  const result = buildHealthCheck({ ...HEALTHY, indexRows: -1 });
  assert.equal(checkNamed(result, "index").status, "unknown");
});

test("index empty (0 rows) → index broken", () => {
  const result = buildHealthCheck({ ...HEALTHY, indexRows: 0 });
  assert.equal(checkNamed(result, "index").status, "broken");
});

test("API mode with no key configured → embedder unknown, not broken", () => {
  const result = buildHealthCheck({
    ...HEALTHY,
    embedderMode: "gemini",
    keyConfigured: false,
    embedderReady: false,
  });
  // A missing API key is the separately-handled state, never a scary "broken".
  assert.equal(checkNamed(result, "embedder").status, "unknown");
});

test("gatherVitals: canary search resolves → embedderReady true, hits captured", async () => {
  const vitals = await gatherVitals({
    embedderMode: "in-process",
    keyConfigured: true,
    readIndexRows: () => 12,
    searchCanary: async () => 4,
  });
  assert.equal(vitals.embedderReady, true);
  assert.equal(vitals.canaryHits, 4);
  assert.equal(vitals.indexRows, 12);
});

test("gatherVitals: a throwing index read → indexRows -1 (unreadable sentinel)", async () => {
  const vitals = await gatherVitals({
    embedderMode: "in-process",
    keyConfigured: true,
    readIndexRows: () => {
      throw new Error("db locked");
    },
    searchCanary: async () => 1,
  });
  assert.equal(vitals.indexRows, -1);
});

test("runHealthCheck: composes gather + build → healthy seams give ok", async () => {
  const result = await runHealthCheck({
    embedderMode: "in-process",
    keyConfigured: true,
    readIndexRows: () => 7,
    searchCanary: async () => 2,
  });
  assert.equal(result.status, "ok");
});

test("gatherVitals: a throwing canary search → embedderReady false, 0 hits", async () => {
  const vitals = await gatherVitals({
    embedderMode: "in-process",
    keyConfigured: true,
    readIndexRows: () => 12,
    searchCanary: async () => {
      throw new Error("embedder boom");
    },
  });
  assert.equal(vitals.embedderReady, false);
  assert.equal(vitals.canaryHits, 0);
});
