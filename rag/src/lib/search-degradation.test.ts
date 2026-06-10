import { test } from "node:test";
import assert from "node:assert/strict";
import { capExceededSearchMessage } from "./search-degradation.js";
import { DailyCapExceededError } from "./usage-tracker.js";

test("4.1 — DailyCapExceededError → clear message (daily quota, resumes tomorrow, index still queryable)", () => {
  const msg = capExceededSearchMessage(new DailyCapExceededError(950, 950));
  assert.notEqual(msg, null);
  assert.match(msg!, /quota/i);
  assert.match(msg!, /tomorrow/i);
});

test("4.1 — any other error → null (we don't mask a real error)", () => {
  assert.equal(capExceededSearchMessage(new Error("network down")), null);
});
