import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chunksPerMinute,
  etaMinutes,
  formatProgressReport,
  formatLastRunMarkdown,
  type RunProgress,
} from "./progress-report.js";

test("C.1 — throughput: 120 chunks in 2 min → 60 chunks/min", () => {
  const rate = chunksPerMinute({
    doneChunks: 120,
    startedAt: "2026-05-31T12:00:00Z",
    now: "2026-05-31T12:02:00Z",
  });

  assert.equal(rate, 60);
});

test("C.1 — throughput: 0 elapsed time → 0 (no division by zero)", () => {
  const rate = chunksPerMinute({
    doneChunks: 5,
    startedAt: "2026-05-31T12:00:00Z",
    now: "2026-05-31T12:00:00Z",
  });

  assert.equal(rate, 0);
});

test("C.2 — ETA: 540 chunks remaining at 60/min → 9 min", () => {
  const eta = etaMinutes({ totalChunks: 660, doneChunks: 120, ratePerMin: 60 });

  assert.equal(eta, 9);
});

test("C.2 — ETA: zero throughput → null (no estimate, no Infinity)", () => {
  const eta = etaMinutes({ totalChunks: 660, doneChunks: 120, ratePerMin: 0 });

  assert.equal(eta, null);
});

test("C.3 — running: catch-up in progress with %, throughput, ETA, errors, duration", () => {
  const state: RunProgress = {
    status: "running",
    startedAt: "2026-05-31T12:00:00Z",
    totalChunks: 660,
    doneChunks: 120,
    scanned: 211,
    indexed: 0,
    skipped: 0,
    removed: 0,
    errors: [],
    hitCap: false,
  };

  const report = formatProgressReport(state, "2026-05-31T12:02:00Z");

  assert.match(report, /in progress/i);
  assert.match(report, /120\s*\/\s*660/); // chunks done / total
  assert.match(report, /18\s*%/); // 120/660
  assert.match(report, /60\s*\/\s*min/); // 120 in 2 min
  assert.match(report, /ETA\s*~?\s*9\s*min/i); // 540 remaining at 60/min
  assert.match(report, /0\s*error/i);
});

test("C.4 — done: last catch-up completed, duration, docs indexed, errors", () => {
  const state: RunProgress = {
    status: "done",
    startedAt: "2026-05-31T12:00:00Z",
    finishedAt: "2026-05-31T12:08:00Z",
    totalChunks: 660,
    doneChunks: 660,
    scanned: 211,
    indexed: 108,
    skipped: 103,
    removed: 0,
    errors: [],
    hitCap: false,
  };

  const report = formatProgressReport(state, "2026-05-31T12:10:00Z");

  assert.match(report, /complet/i);
  assert.match(report, /8\s*min/); // 12:08 - 12:00
  assert.match(report, /108\s*doc/i);
  assert.match(report, /0\s*error/i);
  assert.doesNotMatch(report, /in progress/i);
});

test("C.5 — incomplete / hitCap: quota wall, chunks remaining, auto-resume", () => {
  const state: RunProgress = {
    status: "incomplete",
    startedAt: "2026-05-31T12:00:00Z",
    finishedAt: "2026-05-31T12:05:00Z",
    totalChunks: 660,
    doneChunks: 480,
    scanned: 211,
    indexed: 80,
    skipped: 103,
    removed: 0,
    errors: [],
    hitCap: true,
  };

  const report = formatProgressReport(state, "2026-05-31T12:10:00Z");

  assert.match(report, /incomplete/i);
  assert.match(report, /quota/i); // quota wall
  assert.match(report, /180\s*chunks?\s*remaining/i); // 660 - 480
  assert.match(report, /resume/i);
});

test("C.5 — errors listed but truncated (3 max + count of the rest)", () => {
  const state: RunProgress = {
    status: "incomplete",
    startedAt: "2026-05-31T12:00:00Z",
    finishedAt: "2026-05-31T12:05:00Z",
    totalChunks: 660,
    doneChunks: 480,
    scanned: 211,
    indexed: 80,
    skipped: 103,
    removed: 0,
    errors: ["err-A", "err-B", "err-C", "err-D", "err-E"],
    hitCap: true,
  };

  const report = formatProgressReport(state, "2026-05-31T12:10:00Z");

  assert.match(report, /err-A/);
  assert.match(report, /err-B/);
  assert.match(report, /err-C/);
  assert.doesNotMatch(report, /err-D/); // truncated beyond 3
  assert.match(report, /2\s*other/i); // 5 - 3 remaining
});

test("C.14 — last-run.md: markdown title + report line", () => {
  const state: RunProgress = {
    status: "done",
    startedAt: "2026-05-31T12:00:00Z",
    finishedAt: "2026-05-31T12:08:00Z",
    totalChunks: 660,
    doneChunks: 660,
    scanned: 211,
    indexed: 108,
    skipped: 103,
    removed: 0,
    errors: [],
    hitCap: false,
  };

  const md = formatLastRunMarkdown(state, "2026-05-31T12:10:00Z");

  assert.match(md, /^#\s/m); // a markdown title
  assert.match(md, /108\s*doc/i); // the run summary
  assert.match(md, /complet/i);
});
