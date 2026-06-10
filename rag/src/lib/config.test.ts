import { test } from "node:test";
import assert from "node:assert/strict";
import { QUERY_RESERVE, resolveKey } from "./config.js";

test("QUERY_RESERVE default = 50 (credits reserved for search)", () => {
  assert.equal(QUERY_RESERVE, 50);
});

// The key is read once at MCP process startup. If the user pastes it into .env
// AFTER having launched Claude Code, the process was running with an empty key.
// resolveKey then re-reads the .env on the fly → no need to reconnect the server.
test("resolveKey — keeps the already-loaded key, without re-reading the .env", () => {
  let reloaded = false;
  const key = resolveKey("AIza-already-here", () => {
    reloaded = true;
    return "from-the-file";
  });
  assert.equal(key, "AIza-already-here");
  assert.equal(reloaded, false, "must not re-read the .env if the key is already there");
});

test("resolveKey — key missing at startup → re-reads the .env (key pasted after the fact)", () => {
  assert.equal(resolveKey("", () => "AIza-pasted-after"), "AIza-pasted-after");
});

test("resolveKey — still nothing in the .env → empty string (no crash)", () => {
  assert.equal(resolveKey("", () => undefined), "");
});
