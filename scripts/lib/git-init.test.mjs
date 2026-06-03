import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { shouldInitGit } from "./git-init.mjs";

test("shouldInitGit — vrai si pas de dossier .git", () => {
  const dir = mkdtempSync(join(tmpdir(), "git-init-"));
  try {
    assert.equal(shouldInitGit(dir), true);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("shouldInitGit — faux si .git présent", () => {
  const dir = mkdtempSync(join(tmpdir(), "git-init-"));
  try {
    mkdirSync(join(dir, ".git"));
    assert.equal(shouldInitGit(dir), false);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
