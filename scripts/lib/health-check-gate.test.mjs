import { test } from "node:test";
import assert from "node:assert/strict";
import { gateBlockers } from "./health-check-gate.mjs";

// The LOUD-GATE policy shared by verify-rag.mjs + the installer post-flight (ADR
// 0030: "policy in the caller", but the two loud gates share ONE policy). Over the
// runner's per-module verdicts, it returns the modules that must block the gate
// (→ exit 1, named). It blocks on any `broken`, and on a MANDATORY module that is
// merely `unknown` (we can't PROVE the brain's mandatory capability works). An
// OPTIONAL module that's `unknown` (e.g. an unconfigured local-mirror on a fresh
// install) is benign → never blocks (no cry-wolf, no false install failure).

const MANIFEST = {
  engineModuleRequirements: { "vault-rag": "mandatory", "local-mirror": "optional" },
};

test("a broken module blocks the gate", () => {
  const result = { status: "broken", modules: [{ module: "vault-rag", status: "broken", checks: [] }] };
  const blockers = gateBlockers(result, MANIFEST);
  assert.deepEqual(blockers.map((m) => m.module), ["vault-rag"]);
});

test("a MANDATORY module that is merely unknown blocks the gate (can't prove it works)", () => {
  const result = { status: "unknown", modules: [{ module: "vault-rag", status: "unknown", checks: [] }] };
  const blockers = gateBlockers(result, MANIFEST);
  assert.deepEqual(blockers.map((m) => m.module), ["vault-rag"]);
});

test("an OPTIONAL module that's unknown (unconfigured) never blocks — no false install failure", () => {
  const result = {
    status: "unknown",
    modules: [
      { module: "vault-rag", status: "ok", checks: [] },
      { module: "local-mirror", status: "unknown", checks: [] },
    ],
  };
  assert.deepEqual(gateBlockers(result, MANIFEST), []);
});

test("all ok → no blockers (gate passes)", () => {
  const result = {
    status: "ok",
    modules: [{ module: "vault-rag", status: "ok", checks: [] }],
  };
  assert.deepEqual(gateBlockers(result, MANIFEST), []);
});
