import { test } from "node:test";
import assert from "node:assert/strict";
import { runHealthProbes, formatHealthBanner } from "./health-probe.mjs";

// The probe registry (ADR 0028, F7) runs deterministic functional probes over the
// engine's real capabilities. Each probe is injectable so the registry is unit-testable
// without a live vault / index / MCP server. Every probe fails OPEN to "unknown".

const MANIFEST = { engineMcpServers: ["vault-rag", "local-mirror"] };

test("RAG canary — the demo token is found in the vault → ok", () => {
  const verdict = runHealthProbes({
    manifest: MANIFEST,
    seams: { searchVault: (token) => [`a note mentioning ${token}`] },
  });
  const rag = verdict.find((p) => p.capability === "rag");
  assert.equal(rag.status, "ok");
});

test("RAG canary — the vault returns nothing for the demo token → broken", () => {
  const verdict = runHealthProbes({
    manifest: MANIFEST,
    seams: { searchVault: () => [] },
  });
  const rag = verdict.find((p) => p.capability === "rag");
  assert.equal(rag.status, "broken");
});

test("RAG canary — a throwing search fails OPEN to unknown (never propagates)", () => {
  const verdict = runHealthProbes({
    manifest: MANIFEST,
    seams: {
      searchVault: () => {
        throw new Error("embedder weights missing");
      },
    },
  });
  const rag = verdict.find((p) => p.capability === "rag");
  assert.equal(rag.status, "unknown");
});

test("index integrity — the vector store opens and holds ≥ 1 row → ok", () => {
  const verdict = runHealthProbes({
    manifest: MANIFEST,
    seams: { searchVault: () => ["x"], indexRowCount: () => 1234 },
  });
  const index = verdict.find((p) => p.capability === "index");
  assert.equal(index.status, "ok");
});

test("index integrity — an empty index → broken", () => {
  const verdict = runHealthProbes({
    manifest: MANIFEST,
    seams: { searchVault: () => ["x"], indexRowCount: () => 0 },
  });
  const index = verdict.find((p) => p.capability === "index");
  assert.equal(index.status, "broken");
});

test("embedder readiness — in-process with model weights present → ok", () => {
  const verdict = runHealthProbes({
    manifest: MANIFEST,
    seams: {
      searchVault: () => ["x"],
      indexRowCount: () => 1,
      embedderMode: "in-process",
      weightsPresent: () => true,
    },
  });
  const embedder = verdict.find((p) => p.capability === "embedder");
  assert.equal(embedder.status, "ok");
});

test("embedder readiness — in-process with weights missing → broken", () => {
  const verdict = runHealthProbes({
    manifest: MANIFEST,
    seams: {
      searchVault: () => ["x"],
      indexRowCount: () => 1,
      embedderMode: "in-process",
      weightsPresent: () => false,
    },
  });
  const embedder = verdict.find((p) => p.capability === "embedder");
  assert.equal(embedder.status, "broken");
});

test("embedder readiness — API mode with no key configured → unknown (not broken)", () => {
  const verdict = runHealthProbes({
    manifest: MANIFEST,
    seams: {
      searchVault: () => ["x"],
      indexRowCount: () => 1,
      embedderMode: "api",
      keyConfigured: () => false,
    },
  });
  const embedder = verdict.find((p) => p.capability === "embedder");
  assert.equal(embedder.status, "unknown");
});

test("embedder readiness — API mode with a key configured → ok", () => {
  const verdict = runHealthProbes({
    manifest: MANIFEST,
    seams: {
      searchVault: () => ["x"],
      indexRowCount: () => 1,
      embedderMode: "api",
      keyConfigured: () => true,
    },
  });
  const embedder = verdict.find((p) => p.capability === "embedder");
  assert.equal(embedder.status, "ok");
});

test("engine MCP — every declared engine server answers the handshake → ok", () => {
  const verdict = runHealthProbes({
    manifest: MANIFEST,
    seams: {
      searchVault: () => ["x"],
      indexRowCount: () => 1,
      embedderMode: "in-process",
      weightsPresent: () => true,
      pingServer: () => true,
    },
  });
  const mcp = verdict.find((p) => p.capability === "mcp");
  assert.equal(mcp.status, "ok");
});

test("engine MCP — a registered-but-dead server → broken, named", () => {
  const verdict = runHealthProbes({
    manifest: MANIFEST,
    seams: {
      searchVault: () => ["x"],
      indexRowCount: () => 1,
      embedderMode: "in-process",
      weightsPresent: () => true,
      pingServer: (id) => id !== "local-mirror",
    },
  });
  const mcp = verdict.find((p) => p.capability === "mcp");
  assert.equal(mcp.status, "broken");
  assert.match(mcp.detail, /local-mirror/);
});

test("aggregate — every seam throwing never propagates: 4 capabilities, all unknown", () => {
  const boom = () => {
    throw new Error("boom");
  };
  const verdict = runHealthProbes({
    manifest: MANIFEST,
    seams: {
      searchVault: boom,
      indexRowCount: boom,
      embedderMode: "in-process",
      weightsPresent: boom,
      pingServer: boom,
    },
  });
  assert.deepEqual(
    verdict.map((p) => p.capability).sort(),
    ["embedder", "index", "mcp", "rag"],
  );
  assert.ok(verdict.every((p) => p.status === "unknown"));
});

// ── formatHealthBanner — the cached-health reader's pure formatter (ADR 0028 §1).
// Quiet when healthy (all ok / only unknown → null), one loud banner when broken.

test("formatHealthBanner — all capabilities ok → null (quiet when healthy)", () => {
  const banner = formatHealthBanner([
    { capability: "rag", status: "ok" },
    { capability: "index", status: "ok" },
    { capability: "embedder", status: "ok" },
    { capability: "mcp", status: "ok" },
  ]);
  assert.equal(banner, null);
});

test("formatHealthBanner — a broken capability → one loud banner naming it", () => {
  const banner = formatHealthBanner([
    { capability: "rag", status: "ok" },
    { capability: "mcp", status: "broken", detail: "unreachable: local-mirror" },
  ]);
  assert.ok(banner, "expected a banner string");
  assert.match(banner, /mcp/);
  assert.match(banner, /⚠️/);
});

test("formatHealthBanner — only unknown (no broken) stays quiet → null", () => {
  const banner = formatHealthBanner([
    { capability: "rag", status: "ok" },
    { capability: "embedder", status: "unknown", detail: "api key not configured" },
    { capability: "mcp", status: "unknown", detail: "probe error: boom" },
  ]);
  assert.equal(banner, null);
});

// ── Per-module, actionable, layered messages (ADR 0030 F7-ter, baby-step 5).
// The banner must name the SPECIFIC cause and the RIGHT gesture per broken check —
// never the old generic "restart + /update-engine" catch-all.

test("formatHealthBanner — core vault-rag, index empty → names the cause + the reindex gesture, NOT /update-engine", () => {
  const banner = formatHealthBanner([
    {
      capability: "vault-rag",
      status: "broken",
      checks: [{ name: "index", status: "broken", detail: "index empty" }],
    },
  ]);
  assert.ok(banner, "expected a banner string");
  assert.match(banner, /index empty/);
  assert.match(banner, /reindex/i, "must point at the reindex gesture");
  assert.doesNotMatch(banner, /update-engine/, "no generic /update-engine remedy");
});

test("formatHealthBanner — optional local-mirror broken → soft 'a source behind' tone, NOT a scary core alarm", () => {
  const banner = formatHealthBanner([
    {
      capability: "local-mirror",
      status: "broken",
      checks: [{ name: "store", status: "broken", detail: "mirror store unreachable: ENOENT" }],
    },
  ]);
  assert.ok(banner, "expected a banner string");
  assert.match(banner, /mirror/i);
  assert.match(banner, /still/i, "must reassure the brain itself still works");
  assert.doesNotMatch(banner, /⚠️/, "an optional source behind is not a core ⚠️ alarm");
});

test("formatHealthBanner — embedder in-process weights missing → re-download gesture (not a generic restart)", () => {
  const banner = formatHealthBanner([
    {
      capability: "vault-rag",
      status: "broken",
      checks: [{ name: "embedder", status: "broken", detail: "in-process weights missing" }],
    },
  ]);
  assert.ok(banner, "expected a banner string");
  assert.match(banner, /in-process weights missing/);
  assert.match(banner, /re-download/i, "must point at the model re-download gesture");
});

test("formatHealthBanner — core AND optional broken → both sections, each with its own tone", () => {
  const banner = formatHealthBanner([
    {
      capability: "vault-rag",
      status: "broken",
      checks: [{ name: "index", status: "broken", detail: "index empty" }],
    },
    {
      capability: "local-mirror",
      status: "broken",
      checks: [{ name: "store", status: "broken", detail: "mirror store unreachable: ENOENT" }],
    },
  ]);
  assert.ok(banner, "expected a banner string");
  assert.match(banner, /⚠️.*problem with your brain/s, "core section present");
  assert.match(banner, /ℹ️.*mirrored source is behind/s, "optional section present");
  assert.match(banner, /index empty/);
  assert.match(banner, /mirror store unreachable/);
});
