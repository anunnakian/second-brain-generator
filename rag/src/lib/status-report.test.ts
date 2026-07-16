import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildStatusReport,
  incompleteIndexWarning,
  formatWatcherLiveness,
} from "./status-report.js";
import type { RunProgress } from "./progress-report.js";
import type { SchedulerState } from "./reindex-scheduler.js";

const idle: SchedulerState = { scheduled: false, running: false, pending: false };

// ─── formatWatcherLiveness — exact strings (reflex #2: pin the whole line) ───

test("F.live — watcher inactive → exact inactive line", () => {
  assert.equal(
    formatWatcherLiveness({ active: false }),
    "Live-stream watcher: inactive.",
  );
});

test("F.live — active + explicit idle state → exact idle line", () => {
  assert.equal(
    formatWatcherLiveness({ active: true, state: idle }),
    "Live-stream watcher: active (idle).",
  );
});

test("F.live — active + NO state (null) → idle line, no throw on optional chaining", () => {
  // Pins the `state?.running` / `state?.scheduled` optional-chaining: dropping
  // the `?.` would throw a TypeError when state is null/undefined.
  assert.equal(
    formatWatcherLiveness({ active: true, state: null }),
    "Live-stream watcher: active (idle).",
  );
  assert.equal(
    formatWatcherLiveness({ active: true }),
    "Live-stream watcher: active (idle).",
  );
});

test("F.live — active + reindex scheduled (debounce) → exact scheduled line", () => {
  assert.equal(
    formatWatcherLiveness({ active: true, state: { ...idle, scheduled: true } }),
    "Live-stream watcher: active — write detected, reindex scheduled (debounce).",
  );
});

test("F.live — active + reindex in progress, no burst → exact line, NO pending suffix", () => {
  // Pins the ternary else-branch (`... : ""`): a mutant appending a suffix here
  // must change the exact string.
  assert.equal(
    formatWatcherLiveness({ active: true, state: { ...idle, running: true } }),
    "Live-stream watcher: active — reindex in progress.",
  );
});

test("F.live — active + run in progress WITH burst pending → exact line + \"(burst pending)\"", () => {
  assert.equal(
    formatWatcherLiveness({
      active: true,
      state: { scheduled: false, running: true, pending: true },
    }),
    "Live-stream watcher: active — reindex in progress (burst pending).",
  );
});

// ─── buildStatusReport — exact whole-report assertions ───

test("3.1a — complete index, gemini/default provider → exact 2-line report", () => {
  // Whole-report equality pins the "\n" join separator AND that no null line is
  // pushed when lock/progress are absent (if(lock)/if(progress) guards).
  const report = buildStatusReport({
    docCount: 42,
    scannedCount: 42,
    quotaUsed: 0,
    quotaMax: 950,
    reserve: 50,
    lock: null,
  });

  assert.equal(
    report,
    "Index up to date: 42/42 files indexed.\n" +
      "Quota: 0/950 used today, 950 remaining (reserve 50 for search).",
  );
});

test("3.1b — incomplete index → exact Y/X indexed + Z pending + auto-resume line", () => {
  const report = buildStatusReport({
    docCount: 30,
    scannedCount: 42,
    quotaUsed: 0,
    quotaMax: 950,
    reserve: 50,
    lock: null,
  });

  assert.equal(
    report,
    "Index incomplete: 30/42 files indexed, 12 pending — auto-resume on the next session.\n" +
      "Quota: 0/950 used today, 950 remaining (reserve 50 for search).",
  );
});

test("3.1c — quota line: used / max / remaining + search reserve (exact)", () => {
  const report = buildStatusReport({
    docCount: 42,
    scannedCount: 42,
    quotaUsed: 200,
    quotaMax: 950,
    reserve: 50,
    lock: null,
  });

  assert.equal(
    report,
    "Index up to date: 42/42 files indexed.\n" +
      "Quota: 200/950 used today, 750 remaining (reserve 50 for search).",
  );
});

test("3.1c-bis — explicit providerId \"gemini\" → the Gemini quota line (not the local line)", () => {
  // Triangulates the `providerId === "gemini"` branch: an explicit gemini must
  // route to the quota line, distinct from the undefined (backward-compat) path.
  const report = buildStatusReport({
    docCount: 42,
    scannedCount: 42,
    quotaUsed: 200,
    quotaMax: 950,
    reserve: 50,
    lock: null,
    providerId: "gemini",
  });

  assert.equal(
    report,
    "Index up to date: 42/42 files indexed.\n" +
      "Quota: 200/950 used today, 750 remaining (reserve 50 for search).",
  );
});

test("3.1d — lock present → exact \"reindex in progress (PID …)\" third line", () => {
  const report = buildStatusReport({
    docCount: 42,
    scannedCount: 42,
    quotaUsed: 0,
    quotaMax: 950,
    reserve: 50,
    lock: { pid: 12345, acquiredAt: "2026-05-31T11:59:00Z" },
  });

  assert.equal(
    report,
    "Index up to date: 42/42 files indexed.\n" +
      "Quota: 0/950 used today, 950 remaining (reserve 50 for search).\n" +
      "Reindex in progress (PID 12345).",
  );
});

test("3.1d — no lock → no mention of reindex in progress", () => {
  const report = buildStatusReport({
    docCount: 42,
    scannedCount: 42,
    quotaUsed: 0,
    quotaMax: 950,
    reserve: 50,
    lock: null,
  });

  assert.doesNotMatch(report, /reindex in progress/i);
});

// ─── incompleteIndexWarning (leaf) ───

test("4.2 — incompleteIndexWarning: incomplete index → exact resume message", () => {
  assert.equal(
    incompleteIndexWarning({ docCount: 30, scannedCount: 42 }),
    "Index incomplete: 30/42 files indexed, 12 pending — auto-resume on the next session.",
  );
});

test("4.2 — incompleteIndexWarning: complete index → null (nothing to surface)", () => {
  assert.equal(incompleteIndexWarning({ docCount: 42, scannedCount: 42 }), null);
});

// ─── progress line — the `now ?? startedAt` fallback drives rate/ETA ───

test("C.13 — progress running with `now` → exact 3-line report (now, not startedAt, drives ETA)", () => {
  const progress: RunProgress = {
    status: "running",
    startedAt: "2026-05-31T18:00:00Z",
    totalChunks: 660,
    doneChunks: 120,
    scanned: 211,
    indexed: 18,
    skipped: 50,
    removed: 0,
    errors: [],
    hitCap: false,
  };

  const report = buildStatusReport({
    docCount: 120,
    scannedCount: 211,
    quotaUsed: 200,
    quotaMax: 950,
    reserve: 50,
    lock: null,
    progress,
    now: "2026-05-31T18:01:00Z", // 1 min after startedAt → rate 120/min, ETA 5 min
  });

  // Using startedAt instead of `now` (the `?? → &&` mutant) would zero the
  // elapsed time → "~0/min, ETA unknown".
  assert.equal(
    report,
    "Index incomplete: 120/211 files indexed, 91 pending — auto-resume on the next session.\n" +
      "Quota: 200/950 used today, 750 remaining (reserve 50 for search).\n" +
      "Catch-up in progress: 120/660 chunks (18 %), ~120/min, ETA ~5 min, 0 error(s).",
  );
});

test("C.13 — progress running with `now` OMITTED → falls back to startedAt (elapsed 0 → ETA unknown)", () => {
  // Triangulates the other side of `now ?? progress.startedAt`: with no `now`,
  // the fallback to startedAt gives zero elapsed → rate 0 → ETA unknown.
  const progress: RunProgress = {
    status: "running",
    startedAt: "2026-05-31T18:00:00Z",
    totalChunks: 660,
    doneChunks: 120,
    scanned: 211,
    indexed: 18,
    skipped: 50,
    removed: 0,
    errors: [],
    hitCap: false,
  };

  const report = buildStatusReport({
    docCount: 120,
    scannedCount: 211,
    quotaUsed: 200,
    quotaMax: 950,
    reserve: 50,
    lock: null,
    progress,
    // now omitted
  });

  assert.match(report, /Catch-up in progress: 120\/660 chunks \(18 %\), ~0\/min, ETA unknown, 0 error\(s\)\./);
});

test("C.13 — no progress → no Catch-up section", () => {
  const report = buildStatusReport({
    docCount: 42,
    scannedCount: 42,
    quotaUsed: 0,
    quotaMax: 950,
    reserve: 50,
    lock: null,
  });

  assert.doesNotMatch(report, /catch-up/i);
});

// ─── embedding line per provider — exact, triangulated across all 3 branches ───

test("3.1e — in-process embedder (transformers-js) → exact local line, NO Gemini quota", () => {
  const report = buildStatusReport({
    docCount: 7,
    scannedCount: 7,
    quotaUsed: 0,
    quotaMax: 7600,
    reserve: 50,
    lock: null,
    providerId: "transformers-js",
  });

  assert.equal(
    report,
    "Index up to date: 7/7 files indexed.\n" +
      "Local embeddings (in-process): unlimited, offline — no API quota.",
  );
});

test("3.1f — OpenAI-compatible embedder → exact endpoint line (no offline promise)", () => {
  const report = buildStatusReport({
    docCount: 7,
    scannedCount: 7,
    quotaUsed: 0,
    quotaMax: 7600,
    reserve: 50,
    lock: null,
    providerId: "openai-compatible",
  });

  assert.equal(
    report,
    "Index up to date: 7/7 files indexed.\n" +
      "Embeddings via OpenAI-compatible endpoint: no Gemini quota tracked.",
  );
});

test("3.1g — any other provider → exact generic \"Embeddings via <id>\" fallback line", () => {
  // Triangulates the third branch of localEmbeddingLine: a provider that is
  // neither transformers-js nor openai-compatible names itself verbatim.
  const report = buildStatusReport({
    docCount: 7,
    scannedCount: 7,
    quotaUsed: 0,
    quotaMax: 7600,
    reserve: 50,
    lock: null,
    providerId: "mistral-embed",
  });

  assert.equal(
    report,
    "Index up to date: 7/7 files indexed.\n" +
      "Embeddings via mistral-embed: no Gemini quota tracked.",
  );
});
