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

test("F.live — watcher inactive → \"inactive\"", () => {
  const line = formatWatcherLiveness({ active: false });
  assert.match(line, /watcher.*inactive/i);
});

test("F.live — watcher active idle → \"active … idle\"", () => {
  const line = formatWatcherLiveness({ active: true, state: idle });
  assert.match(line, /active/i);
  assert.match(line, /idle/i);
});

test("F.live — active + reindex scheduled (debounce) → \"scheduled\"", () => {
  const line = formatWatcherLiveness({
    active: true,
    state: { ...idle, scheduled: true },
  });
  assert.match(line, /active/i);
  assert.match(line, /scheduled/i);
});

test("F.live — active + reindex in progress → \"in progress\"", () => {
  const line = formatWatcherLiveness({
    active: true,
    state: { ...idle, running: true },
  });
  assert.match(line, /in progress/i);
});

test("F.live — active + run in progress with burst pending → \"in progress\" + \"pending\"", () => {
  const line = formatWatcherLiveness({
    active: true,
    state: { scheduled: false, running: true, pending: true },
  });
  assert.match(line, /in progress/i);
  assert.match(line, /pending/i);
});

test("3.1a — complete index → \"index up to date\" + Y/X dashboard", () => {
  const report = buildStatusReport({
    docCount: 42,
    scannedCount: 42,
    quotaUsed: 0,
    quotaMax: 950,
    reserve: 50,
    lock: null,
  });

  assert.match(report, /index up to date/i);
  assert.match(report, /42\s*\/\s*42/); // Y/X files indexed
  assert.match(report, /files indexed/i);
});

test("3.1b — incomplete index → Y/X indexed + Z pending + auto-resume", () => {
  const report = buildStatusReport({
    docCount: 30,
    scannedCount: 42,
    quotaUsed: 0,
    quotaMax: 950,
    reserve: 50,
    lock: null,
  });

  assert.doesNotMatch(report, /index up to date/i);
  assert.match(report, /30\s*\/\s*42/); // Y/X indexed
  assert.match(report, /12 pending/i); // 42 - 30
  assert.match(report, /resume/i);
});

test("3.1c — quota line: used / max / remaining + search reserve", () => {
  const report = buildStatusReport({
    docCount: 42,
    scannedCount: 42,
    quotaUsed: 200,
    quotaMax: 950,
    reserve: 50,
    lock: null,
  });

  assert.match(report, /200\s*\/\s*950/); // used / max
  assert.match(report, /750 remaining/i); // 950 - 200
  assert.match(report, /reserve 50.*search/i);
});

test("3.1d — lock present → \"reindex in progress (PID …)\"", () => {
  const report = buildStatusReport({
    docCount: 42,
    scannedCount: 42,
    quotaUsed: 0,
    quotaMax: 950,
    reserve: 50,
    lock: { pid: 12345, acquiredAt: "2026-05-31T11:59:00Z" },
  });

  assert.match(report, /reindex in progress/i);
  assert.match(report, /12345/);
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

test("4.2 — incompleteIndexWarning: incomplete index → resume message", () => {
  const warning = incompleteIndexWarning({ docCount: 30, scannedCount: 42 });
  assert.notEqual(warning, null);
  assert.match(warning!, /incomplete/i);
  assert.match(warning!, /resume/i);
});

test("4.2 — incompleteIndexWarning: complete index → null (nothing to surface)", () => {
  assert.equal(incompleteIndexWarning({ docCount: 42, scannedCount: 42 }), null);
});

test("C.13 — progress running provided → Catch-up section added to the report", () => {
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
    now: "2026-05-31T18:01:00Z",
  });

  assert.match(report, /Catch-up in progress/i);
  assert.match(report, /120\/660/); // chunks done / total
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

test("3.1e — in-process embedder: honest local line, NO Gemini quota", () => {
  const report = buildStatusReport({
    docCount: 7,
    scannedCount: 7,
    quotaUsed: 0,
    quotaMax: 7600,
    reserve: 50,
    lock: null,
    providerId: "transformers-js",
  });

  // The daily quota is specific to Gemini: it must NOT appear in local mode.
  assert.doesNotMatch(report, /quota\s*:/i);
  assert.doesNotMatch(report, /7600/);
  assert.doesNotMatch(report, /today/i);
  // Instead, an honest local line that names the embedder and says unlimited.
  assert.match(report, /in-process/i);
  assert.match(report, /unlimited/i);
});

test("3.1f — OpenAI-compatible embedder: no Gemini quota, without promising offline", () => {
  const report = buildStatusReport({
    docCount: 7,
    scannedCount: 7,
    quotaUsed: 0,
    quotaMax: 7600,
    reserve: 50,
    lock: null,
    providerId: "openai-compatible",
  });

  assert.doesNotMatch(report, /7600/);
  assert.doesNotMatch(report, /today/i);
  // Endpoint named, but we do NOT promise "offline" (it may be remote).
  assert.match(report, /OpenAI-compatible/i);
  assert.doesNotMatch(report, /offline/i);
});
