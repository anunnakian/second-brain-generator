import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sessionSelfHeal } from "./session-self-heal.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const CONVERGED = {
  installSkills: [".claude/skills/local-mirror/**"],
  engineMcpServers: ["vault-rag", "local-mirror"],
};

// Build the seam bundle with spies; override per test.
function seams(overrides = {}) {
  const calls = { spawned: [], emitted: [] };
  const base = {
    brainDir: "/brain",
    readManifest: () => CONVERGED,
    skillDirExists: () => true,
    mcpServerRegistered: () => true,
    spawnReconcile: (arg) => calls.spawned.push(arg),
    emit: (msg) => calls.emitted.push(msg),
  };
  return { args: { ...base, ...overrides }, calls };
}

test("sessionSelfHeal — converged brain → TRUE no-op (no reconcile spawned, nothing emitted)", async () => {
  const { args, calls } = seams();
  const result = await sessionSelfHeal(args);
  assert.equal(result.healed, false);
  assert.equal(calls.spawned.length, 0);
  assert.equal(calls.emitted.length, 0);
});

test("sessionSelfHeal — a gap → spawns reconcile in the background + emits one loud line", async () => {
  const { args, calls } = seams({ mcpServerRegistered: (id) => id !== "local-mirror" });
  const result = await sessionSelfHeal(args);
  assert.equal(result.healed, true);
  assert.deepEqual(calls.spawned, [{ brainDir: "/brain" }]);
  assert.equal(calls.emitted.length, 1);
  assert.match(calls.emitted[0], /local-mirror/);
  // Strong framing (Thomas): the line must make the restart non-optional in tone —
  // an explicit "until you restart, your brain can't use it", not a polite hint.
  assert.match(calls.emitted[0], /action needed/i);
  assert.match(calls.emitted[0], /restart/i);
  assert.match(calls.emitted[0], /can(?:no|')?t use|won't work/i);
});

test("sessionSelfHeal — fail-open: a throwing seam never propagates, logs loudly, spawns nothing", async () => {
  const { args, calls } = seams({
    readManifest: () => {
      throw new Error("manifest unreadable");
    },
  });
  const result = await sessionSelfHeal(args); // must NOT throw
  assert.equal(result.healed, false);
  assert.match(result.error, /manifest unreadable/);
  assert.equal(calls.spawned.length, 0);
  assert.equal(calls.emitted.length, 1);
  assert.match(calls.emitted[0], /self-heal/i);
});

test("settings.json.template wires session-self-heal as a SessionStart hook, BEFORE session-status", () => {
  const settings = JSON.parse(readFileSync(join(REPO_ROOT, ".claude", "settings.json.template"), "utf8"));
  const commands = settings.hooks.SessionStart.flatMap((entry) => entry.hooks.map((h) => h.command));
  const selfHealIdx = commands.findIndex((c) => c.includes("session-self-heal.mjs"));
  const statusIdx = commands.findIndex((c) => c.includes("session-status.mjs"));
  assert.ok(selfHealIdx >= 0, "session-self-heal.mjs must be wired on SessionStart");
  assert.ok(statusIdx >= 0, "session-status.mjs must stay wired on SessionStart");
  assert.ok(selfHealIdx < statusIdx, "self-heal must run before the status banner");
});
