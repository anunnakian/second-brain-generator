import { test } from "node:test";
import assert from "node:assert/strict";

import { repoStatusLine, countVaultUncommitted } from "./repo-status.mjs";

test("countVaultUncommitted: counts porcelain entries under vault/ (modified + untracked)", () => {
  const porcelain = [
    " M vault/notes/idea.md", // modified
    "?? vault/draft.md", //       untracked
    " M rag/.cache/vault.db", // outside vault → ignored
    "?? .env", //                outside vault → ignored
  ].join("\n");
  assert.equal(countVaultUncommitted(porcelain), 2);
});

test("countVaultUncommitted: clean tree → 0", () => {
  assert.equal(countVaultUncommitted(""), 0);
});

test("repoStatusLine: repo up to date → ✅ with the short commit", () => {
  const line = repoStatusLine({
    pullOk: true,
    pullOut: "Already up to date.",
    short: "abc1234",
    changedCount: 0,
    uncommittedVault: 0,
  });
  assert.equal(line, "✅ Repo up to date (commit abc1234).");
});

test("repoStatusLine: pull failed → ⚠️ to check", () => {
  const line = repoStatusLine({ pullOk: false, pullOut: "boom", short: "abc1234", uncommittedVault: 0 });
  assert.match(line, /^⚠️/);
  assert.match(line, /[Pp]ull/);
});

test("repoStatusLine: repo updated → 📥 with the file count", () => {
  const line = repoStatusLine({
    pullOk: true,
    pullOut: "Updating 1..2\nFast-forward",
    short: "abc1234",
    changedCount: 3,
    uncommittedVault: 0,
  });
  assert.match(line, /^📥/);
  assert.match(line, /3 file/);
});

test("repoStatusLine: UNcommitted vault changes → ⚠️ fail-loud (silent auto-commit)", () => {
  const line = repoStatusLine({
    pullOk: true,
    pullOut: "Already up to date.",
    short: "abc1234",
    changedCount: 0,
    uncommittedVault: 2,
  });
  assert.match(line, /^⚠️/); // shouts instead of the green ✅
  assert.match(line, /2/); // number of notes at stake
  assert.match(line, /auto-commit/i); // names the cause (the hook didn't run)
});

test("repoStatusLine: the vault fail-loud TAKES PRIORITY over 'up to date'", () => {
  // Even when the pull says "up to date", uncommitted notes must shout:
  // that's exactly the symptom of silent hooks under nvm (minimal PATH).
  const line = repoStatusLine({
    pullOk: true,
    pullOut: "Already up to date.",
    short: "abc1234",
    changedCount: 0,
    uncommittedVault: 1,
  });
  assert.doesNotMatch(line, /✅/);
});
