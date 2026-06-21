import { test } from "node:test";
import assert from "node:assert/strict";
import { restartNudgeSegment, RESTART_FLAG_REL } from "./restart-nudge.mjs";

// F-B7d (ship-blocker A2): the SessionStart self-heal nudge must reach Desktop, which
// drops `systemMessage` — so it rides the PERSISTENT statusLine instead. status-line.mjs
// calls this pure decider with "is a restart pending?" (the on-disk flag), and shows a
// loud, unmissable segment until a fresh session has loaded the converged engine.
test("restartNudgeSegment — pending → a loud, unmissable restart segment", () => {
  const seg = restartNudgeSegment(true);
  assert.ok(seg, "a pending restart must produce a segment");
  assert.match(seg, /restart/i);
  assert.match(seg, /⚠️/);
});

test("restartNudgeSegment — not pending → no segment (null), so the status line stays clean", () => {
  assert.equal(restartNudgeSegment(false), null);
});

// The flag the self-heal writes / status-line reads lives under the gitignored .cache/ so
// it never reaches the user's git history (cross-machine noise) — a per-checkout marker.
test("RESTART_FLAG_REL — a stable, gitignored .cache-relative path", () => {
  assert.match(RESTART_FLAG_REL, /^\.cache\//);
});
