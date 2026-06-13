import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOpenEnvCommand, shouldOpenEnv, openEnvInEditor } from "./open-env.mjs";

test("buildOpenEnvCommand — darwin → open -t <absPath> (TextEdit)", () => {
  assert.deepEqual(buildOpenEnvCommand("darwin", "/home/u/brain/.env"), {
    command: "open",
    args: ["-t", "/home/u/brain/.env"],
  });
});

test("buildOpenEnvCommand — win32 → notepad <absPath>", () => {
  assert.deepEqual(buildOpenEnvCommand("win32", "C:\\u\\brain\\.env"), {
    command: "notepad",
    args: ["C:\\u\\brain\\.env"],
  });
});

test("buildOpenEnvCommand — linux → xdg-open <absPath> (GUI default)", () => {
  assert.deepEqual(buildOpenEnvCommand("linux", "/home/u/brain/.env"), {
    command: "xdg-open",
    args: ["/home/u/brain/.env"],
  });
});

test("buildOpenEnvCommand — unknown platform → null", () => {
  assert.equal(buildOpenEnvCommand("aix", "/home/u/brain/.env"), null);
});

test("shouldOpenEnv — plain desktop session → true", () => {
  assert.equal(shouldOpenEnv({}, "darwin"), true);
});

test("shouldOpenEnv — SBG_NO_OPEN_ENV set → false (escape hatch)", () => {
  assert.equal(shouldOpenEnv({ SBG_NO_OPEN_ENV: "1" }, "darwin"), false);
});

test("shouldOpenEnv — CI set → false", () => {
  assert.equal(shouldOpenEnv({ CI: "true" }, "darwin"), false);
});

test("shouldOpenEnv — linux headless (no DISPLAY/WAYLAND) → false", () => {
  assert.equal(shouldOpenEnv({}, "linux"), false);
});

test("shouldOpenEnv — linux with DISPLAY → true", () => {
  assert.equal(shouldOpenEnv({ DISPLAY: ":0" }, "linux"), true);
});

test("openEnvInEditor — desktop session → spawns detached and returns {opened:true}", () => {
  const calls = [];
  let unrefed = false;
  const spawn = (command, args, opts) => {
    calls.push({ command, args, opts });
    return { unref: () => { unrefed = true; } };
  };
  const res = openEnvInEditor("/home/u/brain/.env", { platform: "darwin", env: {}, spawn });
  assert.deepEqual(res, { opened: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "open");
  assert.deepEqual(calls[0].args, ["-t", "/home/u/brain/.env"]);
  assert.equal(calls[0].opts.detached, true);
  assert.equal(calls[0].opts.stdio, "ignore");
  assert.equal(unrefed, true);
});

test("openEnvInEditor — guard off (SBG_NO_OPEN_ENV) → no spawn, {opened:false}", () => {
  let called = false;
  const spawn = () => { called = true; return { unref() {} }; };
  const res = openEnvInEditor("/x/.env", { platform: "darwin", env: { SBG_NO_OPEN_ENV: "1" }, spawn });
  assert.deepEqual(res, { opened: false });
  assert.equal(called, false);
});

test("openEnvInEditor — unknown platform (no command) → no spawn, {opened:false}", () => {
  let called = false;
  const spawn = () => { called = true; return { unref() {} }; };
  const res = openEnvInEditor("/x/.env", { platform: "aix", env: {}, spawn });
  assert.deepEqual(res, { opened: false });
  assert.equal(called, false);
});

test("openEnvInEditor — throwing spawn is swallowed → {opened:false}", () => {
  const spawn = () => { throw new Error("ENOENT"); };
  const res = openEnvInEditor("/x/.env", { platform: "darwin", env: {}, spawn });
  assert.deepEqual(res, { opened: false });
});
