import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSelfHealGap } from "./self-heal-detect.mjs";

// A brain whose engine-declared skills are all installed and whose engine MCP
// servers are all registered → nothing to heal (the steady state, and the path
// the SessionStart self-heal must keep a TRUE no-op).
const MANIFEST = {
  installSkills: [".claude/skills/local-mirror/**", ".claude/skills/update-engine/**"],
  engineMcpServers: ["vault-rag", "local-mirror"],
};

test("detectSelfHealGap — converged brain (all skills + servers present) → not needed", () => {
  const gap = detectSelfHealGap({
    manifest: MANIFEST,
    skillDirExists: () => true,
    mcpServerRegistered: () => true,
  });
  assert.equal(gap.needed, false);
});

test("detectSelfHealGap — a freshly-shipped skill not yet installed → needed, named", () => {
  const gap = detectSelfHealGap({
    manifest: MANIFEST,
    skillDirExists: (dir) => dir !== ".claude/skills/local-mirror",
    mcpServerRegistered: () => true,
  });
  assert.equal(gap.needed, true);
  assert.deepEqual(gap.missingSkills, [".claude/skills/local-mirror"]);
  assert.deepEqual(gap.missingServers, []);
});

test("detectSelfHealGap — a freshly-shipped MCP server not yet registered → needed, named", () => {
  const gap = detectSelfHealGap({
    manifest: MANIFEST,
    skillDirExists: () => true,
    mcpServerRegistered: (id) => id !== "local-mirror",
  });
  assert.equal(gap.needed, true);
  assert.deepEqual(gap.missingSkills, []);
  assert.deepEqual(gap.missingServers, ["local-mirror"]);
});
