import { test } from "node:test";
import assert from "node:assert/strict";

import { runEval } from "./eval-run.mjs";

const ITEMS = [
  { question: "Q1 easy", expect: "answer 1" },
  { question: "Q2 missed", expect: "answer 2" },
];

// fake search: returns one text per query, in order.
const fakeSearch = async (queries) =>
  queries.map((query) => ({ query, text: `passages for ${query}` }));

// fake judge: PASS if the prompt mentions Q1, FAIL otherwise (deterministic).
const fakeJudge = async (prompt) =>
  prompt.includes("Q1 easy") ? "VERDICT: PASS" : "VERDICT: FAIL";

test("runEval chains search → judge → verdict and aggregates the score", async () => {
  const report = await runEval({ items: ITEMS, search: fakeSearch, judge: fakeJudge });

  assert.equal(report.passed, 1);
  assert.equal(report.total, 2);
  assert.equal(report.score, 0.5);
  assert.equal(report.results[0].question, "Q1 easy");
  assert.equal(report.results[0].pass, true);
  assert.equal(report.results[1].pass, false);
});
