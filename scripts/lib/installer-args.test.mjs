import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { parseAnswers, resolveTargetDir, resolveRunMode } from "./installer-args.mjs";

test("parseAnswers — --x=v form", () => {
  const r = parseAnswers(["--name=my-brain"], {}, {});
  assert.equal(r.projectName, "my-brain");
});

test("parseAnswers — --x v form (space)", () => {
  const r = parseAnswers(["--name", "my-brain"], {}, {});
  assert.equal(r.projectName, "my-brain");
});

test("parseAnswers — no key/secret is ever recognized (security)", () => {
  for (const argv of [
    ["--gemini-key", "SECRET", "--name", "ok"],
    ["--gemini-key=SECRET", "--name=ok"],
    ["--key=SECRET"],
    ["--GOOGLE_GEMINI_API_KEY=SECRET"],
  ]) {
    const r = parseAnswers(argv, {}, {});
    assert.ok(
      !Object.values(r).includes("SECRET"),
      `secret leaked into output for ${argv.join(" ")}`,
    );
    assert.equal("geminiKey" in r, false);
  }
  // the rest keeps parsing normally despite the stray flag
  assert.equal(parseAnswers(["--gemini-key", "SECRET", "--name", "ok"], {}, {}).projectName, "ok");
});

test("parseAnswers — --embedder (v and =v forms, + env SB_EMBEDDER) → embedder", () => {
  assert.equal(parseAnswers(["--embedder", "in-process"], {}, {}).embedder, "in-process");
  assert.equal(parseAnswers(["--embedder=gemini"], {}, {}).embedder, "gemini");
  assert.equal(parseAnswers([], { SB_EMBEDDER: "ollama" }, {}).embedder, "ollama");
  // absent → undefined (the installer will apply the machine recommendation)
  assert.equal(parseAnswers([], {}, {}).embedder, undefined);
});

test("resolveRunMode — --help takes priority over everything → 'help'", () => {
  assert.equal(resolveRunMode({ isTTY: true, nonInteractive: true, help: true }), "help");
  assert.equal(resolveRunMode({ isTTY: false, nonInteractive: false, help: true }), "help");
});

test("resolveRunMode — explicit --non-interactive → 'non-interactive' (with or without TTY)", () => {
  assert.equal(resolveRunMode({ isTTY: true, nonInteractive: true, help: false }), "non-interactive");
  assert.equal(resolveRunMode({ isTTY: false, nonInteractive: true, help: false }), "non-interactive");
});

test("resolveRunMode — TTY without --non-interactive → 'interactive'", () => {
  assert.equal(resolveRunMode({ isTTY: true, nonInteractive: false, help: false }), "interactive");
});

test("resolveRunMode — neither TTY nor --non-interactive → 'refuse' (anti phantom install)", () => {
  assert.equal(resolveRunMode({ isTTY: false, nonInteractive: false, help: false }), "refuse");
});

test("resolveTargetDir — without destParent → join(home, name)", () => {
  assert.equal(
    resolveTargetDir({ name: "personal", destParent: undefined, home: "/home/me" }),
    join("/home/me", "personal"),
  );
});

test("resolveTargetDir — with destParent → join(destParent, name)", () => {
  assert.equal(
    resolveTargetDir({ name: "work", destParent: "/data/brains", home: "/home/me" }),
    join("/data/brains", "work"),
  );
});

test("parseAnswers — --dest (v and =v forms) → destParent", () => {
  assert.equal(parseAnswers(["--dest", "/parent"], {}, {}).destParent, "/parent");
  assert.equal(parseAnswers(["--dest=/parent"], {}, {}).destParent, "/parent");
});

test("parseAnswers — destParent: precedence flag (--dest) > env (SB_DEST) > default", () => {
  // env wins over default
  assert.equal(parseAnswers([], { SB_DEST: "/env" }, {}).destParent, "/env");
  // flag wins over env
  assert.equal(parseAnswers(["--dest=/flag"], { SB_DEST: "/env" }, {}).destParent, "/flag");
  // default otherwise
  assert.equal(parseAnswers([], {}, { destParent: "/def" }).destParent, "/def");
});

test("parseAnswers — --help / -h → help:true (otherwise false)", () => {
  assert.equal(parseAnswers(["--help"], {}, {}).help, true);
  assert.equal(parseAnswers(["-h"], {}, {}).help, true);
  assert.equal(parseAnswers(["--name=ok"], {}, {}).help, false);
});

test("parseAnswers — --non-interactive and its aliases → nonInteractive:true", () => {
  for (const flag of ["--non-interactive", "--yes", "--no-input"]) {
    assert.equal(parseAnswers([flag], {}, {}).nonInteractive, true, `${flag}`);
  }
  assert.equal(parseAnswers([], {}, {}).nonInteractive, false);
});

test("parseAnswers — precedence flag > env > default", () => {
  const defaults = {
    projectName: "def-proj",
    ownerName: "def-owner",
    language: "def-lang",
  };
  const env = {
    SB_PROJECT_NAME: "env-proj",
    SB_OWNER_NAME: "env-owner",
    SB_LANGUAGE: "env-lang",
  };
  // flag wins over env and default
  const flagWins = parseAnswers(["--owner=flag-owner"], env, defaults);
  assert.equal(flagWins.ownerName, "flag-owner");
  // env wins over default (no flag)
  assert.equal(flagWins.projectName, "env-proj");
  // default if neither flag nor env
  const onlyDefaults = parseAnswers([], {}, defaults);
  assert.deepEqual(onlyDefaults, {
    projectName: "def-proj",
    ownerName: "def-owner",
    language: "def-lang",
    destParent: undefined,
    embedder: undefined,
    nonInteractive: false,
    help: false,
  });
});
