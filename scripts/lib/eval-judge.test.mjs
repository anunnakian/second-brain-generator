import { test } from "node:test";
import assert from "node:assert/strict";

import { parseVerdict, scoreEval, buildJudgePrompt } from "./eval-judge.mjs";

const ITEM = {
  question: "Who won the Inertia Trophy 2025?",
  expect: "Pélagie de Mollecuisse, with a DNR of 98.7%.",
};
const RETRIEVED = "### 1. Inertia Trophy — Consequences\nPélagie de Mollecuisse, DNR 98.7%.";

test("parseVerdict reads a PASS in the judge's output", () => {
  assert.deepEqual(parseVerdict("The passages contain the answer.\nVERDICT: PASS"), {
    pass: true,
  });
});

test("parseVerdict reads a FAIL in the judge's output", () => {
  assert.deepEqual(parseVerdict("The right passage is missing.\nVERDICT: FAIL"), {
    pass: false,
  });
});

test("parseVerdict flags an unreadable verdict (neither PASS nor FAIL)", () => {
  // Crashed judge / empty output: we do NOT count a silent FAIL (it would skew the
  // score) → we mark it indeterminate so the eval surfaces it loudly.
  assert.deepEqual(parseVerdict("blah blah no verdict"), {
    pass: false,
    unreadable: true,
  });
});

test("scoreEval aggregates a single PASS into a score of 1", () => {
  assert.deepEqual(scoreEval([{ pass: true }]), {
    passed: 1,
    total: 1,
    unreadable: 0,
    score: 1,
  });
});

test("scoreEval counts unreadable ones in the total and computes the ratio", () => {
  const results = [{ pass: true }, { pass: false }, { pass: false, unreadable: true }];
  assert.deepEqual(scoreEval(results), {
    passed: 1,
    total: 3,
    unreadable: 1,
    score: 1 / 3,
  });
});

test("scoreEval on an empty list gives 0, not NaN", () => {
  assert.deepEqual(scoreEval([]), { passed: 0, total: 0, unreadable: 0, score: 0 });
});

test("buildJudgePrompt includes the question to judge", () => {
  assert.ok(buildJudgePrompt(ITEM, RETRIEVED).includes(ITEM.question));
});

test("buildJudgePrompt includes the expected answer", () => {
  assert.ok(buildJudgePrompt(ITEM, RETRIEVED).includes(ITEM.expect));
});

test("buildJudgePrompt includes the passages returned by the search", () => {
  assert.ok(buildJudgePrompt(ITEM, RETRIEVED).includes(RETRIEVED));
});

test("buildJudgePrompt enforces the verdict format expected by parseVerdict", () => {
  const prompt = buildJudgePrompt(ITEM, RETRIEVED);
  assert.ok(prompt.includes("VERDICT: PASS"));
  assert.ok(prompt.includes("VERDICT: FAIL"));
});
