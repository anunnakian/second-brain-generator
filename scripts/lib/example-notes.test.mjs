import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isExampleNote, findExampleNotes, clearExampleNotes } from "./example-notes.mjs";

const fmExemple = "---\ntype: topic\ntags: [exemple, architecture]\n---\n\n# Demo\n";
const fmHarnais = "---\ntype: backlog\ntags: [harnais, backlog]\n---\n\n# Frictions\n";
const noFm = "# vault/ — Ton contenu\n\nDoc, pas une note.\n";

test("isExampleNote — vrai si le tag exemple est présent", () => {
  assert.equal(isExampleNote(fmExemple), true);
});

test("isExampleNote — faux si pas de tag exemple", () => {
  assert.equal(isExampleNote(fmHarnais), false);
});

test("isExampleNote — faux sans frontmatter", () => {
  assert.equal(isExampleNote(noFm), false);
});

function makeVault() {
  const dir = mkdtempSync(join(tmpdir(), "vault-ex-"));
  mkdirSync(join(dir, "topics"), { recursive: true });
  mkdirSync(join(dir, "backlog"), { recursive: true });
  writeFileSync(join(dir, "topics", "demo.md"), fmExemple);
  writeFileSync(join(dir, "backlog", "harnais.md"), fmHarnais);
  writeFileSync(join(dir, "README.md"), noFm);
  return dir;
}

test("findExampleNotes — ne retourne que les notes taggées exemple", () => {
  const dir = makeVault();
  try {
    const found = findExampleNotes(dir);
    assert.deepEqual(found, [join(dir, "topics", "demo.md")]);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("clearExampleNotes — supprime les exemples, garde la machinerie", () => {
  const dir = makeVault();
  try {
    const deleted = clearExampleNotes(dir);
    assert.deepEqual(deleted, [join(dir, "topics", "demo.md")]);
    assert.equal(existsSync(join(dir, "topics", "demo.md")), false);
    assert.equal(existsSync(join(dir, "backlog", "harnais.md")), true);
    assert.equal(existsSync(join(dir, "README.md")), true);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
