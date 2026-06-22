import { test } from "node:test";
import assert from "node:assert/strict";
import { checkNode, NODE_WINDOW } from "./node-compat.mjs";

// The supported Node window for the RAG engine's native deps. Floor raised to 22:
// Node 20 is EOL (April 2026) and better-sqlite3 ≥ 12.10 no longer ships a Node-20
// (ABI 115) prebuild. Ceiling = highest declared support.
const WINDOW = { min: 22, max: 26 };

test("NODE_WINDOW: the shared constant matches the engine's native-dep window", () => {
  assert.deepEqual(NODE_WINDOW, { min: 22, max: 26 });
});

test("checkNode: a version inside the window is ok", () => {
  const verdict = checkNode("22.4.0", WINDOW);
  assert.equal(verdict.ok, true);
});

test("checkNode: below the floor is a hard fail with an actionable message", () => {
  const verdict = checkNode("18.20.0", WINDOW);
  assert.equal(verdict.ok, false);
  assert.match(verdict.message, /18/); // names the detected version
  assert.match(verdict.message, /22/); // names the required floor
  assert.match(verdict.message, /nvm|volta|nodejs\.org/i); // tells how to switch
});

test("checkNode: Node 20 now fails (floor raised — Node 20 is EOL, no prebuilt binary)", () => {
  const verdict = checkNode("20.18.0", WINDOW);
  assert.equal(verdict.ok, false);
  assert.match(verdict.message, /EOL|prebuilt|prebuild/i); // explains why 20 is dropped
});

test("checkNode: Node 21 is below the new floor and fails", () => {
  const verdict = checkNode("21.7.0", WINDOW);
  assert.equal(verdict.ok, false);
});

test("checkNode: above the declared ceiling warns but still allows (forward-friendly)", () => {
  const verdict = checkNode("28.0.0", WINDOW);
  assert.equal(verdict.ok, true); // never block a newer Node
  assert.equal(verdict.warn, true);
  assert.match(verdict.message, /28/); // names the detected version
  assert.match(verdict.message, /26/); // names the tested ceiling
});

test("checkNode: exactly on the ceiling is plainly ok (no warning)", () => {
  const verdict = checkNode("26.9.0", WINDOW);
  assert.equal(verdict.ok, true);
  assert.ok(!verdict.warn);
});

test("checkNode: exactly on the floor is ok (the floor is inclusive)", () => {
  const verdict = checkNode("22.0.0", WINDOW);
  assert.equal(verdict.ok, true);
  assert.ok(!verdict.warn);
});
