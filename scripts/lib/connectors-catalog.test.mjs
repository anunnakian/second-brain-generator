import { test } from "node:test";
import assert from "node:assert/strict";

import { CONNECTORS } from "./connectors-catalog.mjs";

test("the catalog contains 2 to 8 connectors", () => {
  assert.ok(Array.isArray(CONNECTORS));
  assert.ok(CONNECTORS.length >= 2 && CONNECTORS.length <= 8, `len=${CONNECTORS.length}`);
});

test("each connector has id/label/kind/credentialsHint, unique ids", () => {
  const ids = new Set();
  for (const c of CONNECTORS) {
    assert.ok(c.id, "missing id");
    assert.ok(c.label, `missing label for ${c.id}`);
    assert.ok(["mcp", "native"].includes(c.kind), `invalid kind for ${c.id}`);
    assert.ok(c.credentialsHint, `missing credentialsHint for ${c.id}`);
    assert.ok(!ids.has(c.id), `duplicate id: ${c.id}`);
    ids.add(c.id);
  }
});

test("each connector exposes useCases (\"what for\" ideas)", () => {
  for (const c of CONNECTORS) {
    assert.ok(Array.isArray(c.useCases) && c.useCases.length > 0, `missing useCases for ${c.id}`);
    for (const u of c.useCases) {
      assert.equal(typeof u, "string", `non-string useCase for ${c.id}`);
      assert.ok(u.trim().length > 0, `empty useCase for ${c.id}`);
    }
  }
});

test("Gmail is in the catalog (native connector)", () => {
  const gmail = CONNECTORS.find((c) => c.id === "gmail");
  assert.ok(gmail, "missing gmail connector");
  assert.equal(gmail.kind, "native");
});

test("meeting transcripts are covered by Drive AND Calendar (use case, not a third-party product)", () => {
  const mentionsTranscript = (c) =>
    (c.useCases ?? []).some((u) => /transcript/i.test(u));
  const drive = CONNECTORS.find((c) => c.id === "google-drive");
  const calendar = CONNECTORS.find((c) => c.id === "google-calendar");
  assert.ok(drive && mentionsTranscript(drive), "Drive should mention transcripts in its useCases");
  assert.ok(calendar && mentionsTranscript(calendar), "Calendar should mention transcripts in its useCases");
});

test("mcp connectors: serverConfig + permissions, env as placeholders (no real secret)", () => {
  const mcp = CONNECTORS.filter((c) => c.kind === "mcp");
  assert.ok(mcp.length >= 1, "at least one mcp connector expected");
  for (const c of mcp) {
    assert.ok(c.serverConfig, `missing serverConfig for ${c.id}`);
    assert.ok(Array.isArray(c.permissions) && c.permissions.length > 0, `missing permissions for ${c.id}`);
    for (const p of c.permissions) {
      assert.match(p, /^mcp__/, `non-mcp permission for ${c.id}: ${p}`);
    }
    // neutrality: every env value is a placeholder <...>, never a real secret
    for (const v of Object.values(c.serverConfig.env ?? {})) {
      assert.match(v, /^<.+>$/, `non-placeholder env for ${c.id}: ${v}`);
    }
  }
});

test("native connectors: no serverConfig (nothing to write into .mcp.json)", () => {
  for (const c of CONNECTORS.filter((c) => c.kind === "native")) {
    assert.equal(c.serverConfig, undefined, `a native connector must not have a serverConfig: ${c.id}`);
  }
});
