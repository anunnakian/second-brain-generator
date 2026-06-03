import { test } from "node:test";
import assert from "node:assert/strict";
import { planGitSetup } from "./git-init.mjs";

// planGitSetup : décision PURE des actions git à l'install. Aucune op irréversible.
//  - init       : faut-il `git init` (pas de dépôt) ?
//  - stripRemote: faut-il retirer le remote hérité (clone resté lié au starter) ?
//  - commit     : faut-il committer les fichiers générés ?

test("planGitSetup — copie détachée, install fraîche (pas de .git) → init + commit", () => {
  assert.deepEqual(
    planGitSetup({ hasDotGit: false, wasStub: true, isMaintainer: false }),
    { init: true, stripRemote: false, commit: true },
  );
});

test("planGitSetup — clone LIÉ, install fraîche (.git hérité) → strip remote + commit, pas d'init", () => {
  assert.deepEqual(
    planGitSetup({ hasDotGit: true, wasStub: true, isMaintainer: false }),
    { init: false, stripRemote: true, commit: true },
  );
});

test("planGitSetup — repo de dev du mainteneur (CLAUDE.local.md présent) → on ne touche à rien", () => {
  assert.deepEqual(
    planGitSetup({ hasDotGit: true, wasStub: true, isMaintainer: true }),
    { init: false, stripRemote: false, commit: false },
  );
});

test("planGitSetup — re-exécution sur un cerveau déjà installé (pas une amorce) → idempotent, rien", () => {
  assert.deepEqual(
    planGitSetup({ hasDotGit: true, wasStub: false, isMaintainer: false }),
    { init: false, stripRemote: false, commit: false },
  );
});
