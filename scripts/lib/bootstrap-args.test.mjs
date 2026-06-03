import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAnswers } from "./bootstrap-args.mjs";

test("parseAnswers — forme --x=v", () => {
  const r = parseAnswers(["--name=mon-cerveau"], {}, {});
  assert.equal(r.projectName, "mon-cerveau");
});

test("parseAnswers — forme --x v (espace)", () => {
  const r = parseAnswers(["--name", "mon-cerveau"], {}, {});
  assert.equal(r.projectName, "mon-cerveau");
});

test("parseAnswers — aucune clé/secret n'est jamais reconnue (sécurité)", () => {
  for (const argv of [
    ["--gemini-key", "SECRET", "--name", "ok"],
    ["--gemini-key=SECRET", "--name=ok"],
    ["--key=SECRET"],
    ["--GOOGLE_GEMINI_API_KEY=SECRET"],
  ]) {
    const r = parseAnswers(argv, {}, {});
    assert.ok(
      !Object.values(r).includes("SECRET"),
      `secret fuite dans la sortie pour ${argv.join(" ")}`,
    );
    assert.equal("geminiKey" in r, false);
  }
  // le reste continue de parser normalement malgré le flag parasite
  assert.equal(parseAnswers(["--gemini-key", "SECRET", "--name", "ok"], {}, {}).projectName, "ok");
});

test("parseAnswers — --non-interactive et ses alias → nonInteractive:true", () => {
  for (const flag of ["--non-interactive", "--yes", "--no-input"]) {
    assert.equal(parseAnswers([flag], {}, {}).nonInteractive, true, `${flag}`);
  }
  assert.equal(parseAnswers([], {}, {}).nonInteractive, false);
});

test("parseAnswers — précédence flag > env > default", () => {
  const defaults = {
    projectName: "def-proj",
    ownerName: "def-owner",
    ownerContext: "def-ctx",
    language: "def-lang",
  };
  const env = {
    SB_PROJECT_NAME: "env-proj",
    SB_OWNER_NAME: "env-owner",
    SB_OWNER_CONTEXT: "env-ctx",
    SB_LANGUAGE: "env-lang",
  };
  // flag gagne sur env et default
  const flagWins = parseAnswers(["--owner=flag-owner"], env, defaults);
  assert.equal(flagWins.ownerName, "flag-owner");
  // env gagne sur default (pas de flag)
  assert.equal(flagWins.projectName, "env-proj");
  // default si ni flag ni env
  const onlyDefaults = parseAnswers([], {}, defaults);
  assert.deepEqual(onlyDefaults, {
    projectName: "def-proj",
    ownerName: "def-owner",
    ownerContext: "def-ctx",
    language: "def-lang",
    nonInteractive: false,
  });
});
