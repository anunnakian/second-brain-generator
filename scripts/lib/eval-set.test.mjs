import { test } from "node:test";
import assert from "node:assert/strict";

import { EVAL_SET } from "./eval-set.mjs";
import { DEMO_EXPECT } from "./demo.mjs";

test("the eval-set has at least 8 questions, all well-formed", () => {
  assert.ok(EVAL_SET.length >= 8, `expected ≥ 8 questions, saw ${EVAL_SET.length}`);
  for (const item of EVAL_SET) {
    assert.equal(typeof item.question, "string");
    assert.ok(item.question.trim().length > 0, "empty question");
    assert.equal(typeof item.expect, "string");
    assert.ok(item.expect.trim().length > 0, "empty expected answer");
  }
});

test("the eval-set is anchored on the proven semantic canary (Mollecuisse)", () => {
  // At least one question must rely on the grep-proof fact from demo.mjs: this keeps
  // the eval-set anchored to the semantic proof already locked by demo.test.mjs.
  assert.ok(EVAL_SET.some((item) => DEMO_EXPECT.test(item.expect)));
});
