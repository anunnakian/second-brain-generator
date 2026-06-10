#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// auto-commit.mjs — deterministic vault persistence. Called by the PostToolUse
// hook (Write|Edit): commit (+ push if a remote exists) on every file
// modification — hence the "auto: …" commits.
//
// Cross-OS: pure Node, no shell dependency. The repo root is derived from the
// script location (not the hook's cwd).
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function git(args) {
  try {
    const out = execFileSync("git", args, {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { out: out ?? "", ok: true };
  } catch (e) {
    return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, ok: false };
  }
}

// Synchronous pause (the hook runs in blocking mode, with a timeout on the Claude Code side).
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const dirty = git(["status", "--porcelain"]).out.trim().length > 0;
if (!dirty) process.exit(0);

git(["add", "."]);
git(["commit", "-m", "auto: vault/claude sync"]);

// Explicit OPT-IN push (Layer 1): the mere presence of a remote is NOT enough.
// We only push if the user has enabled it (`git config secondbrain.autopush
// true`, set by the "remote repository" step of the install).
// Guarantee: an inherited remote (a clone still linked to the generator) NEVER
// receives the private notes — leaking is impossible by default, without
// touching .git.
const hasRemote = git(["remote"]).out.trim().length > 0;
const autopush = git(["config", "--get", "secondbrain.autopush"]).out.trim() === "true";
if (hasRemote && autopush && !git(["push"]).ok) {
  sleepSync(3000);
  if (!git(["push"]).ok) {
    process.stdout.write(
      "\n⚠️  PUSH FAILED — local commit OK but not pushed. Check your network then: git push\n"
    );
  }
}
