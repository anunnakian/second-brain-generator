import { test } from "node:test";
import assert from "node:assert/strict";

import { isNativeAbiError, loadNativeWithRebuild } from "./native-deps.js";

const abiErr = () =>
  new Error("compiled against a different Node.js version using NODE_MODULE_VERSION 137");

test("isNativeAbiError: a NODE_MODULE_VERSION mismatch is an ABI error", () => {
  const err = new Error(
    "The module '/b/rag/node_modules/better-sqlite3/build/Release/better_sqlite3.node' " +
      "was compiled against a different Node.js version using NODE_MODULE_VERSION 137. " +
      "This version of Node.js requires NODE_MODULE_VERSION 127.",
  );
  assert.equal(isNativeAbiError(err), true);
});

test("isNativeAbiError: an unrelated error is NOT an ABI error (never rebuild blindly)", () => {
  assert.equal(isNativeAbiError(new Error("SQLITE_CORRUPT: database disk image is malformed")), false);
  assert.equal(isNativeAbiError(new Error("ENOENT: no such file or directory, open 'vault.db'")), false);
});

test("isNativeAbiError: a missing/unbuilt binding ('Could not locate the bindings file') also self-heals", () => {
  const err = new Error(
    "Could not locate the bindings file. Tried:\n → .../better_sqlite3.node",
  );
  assert.equal(isNativeAbiError(err), true);
});

test("loadNativeWithRebuild: ABI error → rebuild once → retry → returns the module", () => {
  let attempts = 0;
  let rebuilds = 0;
  const load = () => {
    attempts += 1;
    if (attempts === 1) throw abiErr();
    return "DB";
  };
  const result = loadNativeWithRebuild(load, () => { rebuilds += 1; });
  assert.equal(result, "DB");
  assert.equal(rebuilds, 1); // rebuilt exactly once
  assert.equal(attempts, 2); // initial fail + one retry
});

test("loadNativeWithRebuild: an unrelated error propagates and NEVER rebuilds", () => {
  let rebuilds = 0;
  assert.throws(
    () => loadNativeWithRebuild(() => { throw new Error("SQLITE_CORRUPT"); }, () => { rebuilds += 1; }),
    /SQLITE_CORRUPT/,
  );
  assert.equal(rebuilds, 0);
});

test("loadNativeWithRebuild: a STILL-broken binding after rebuild fails loud (one rebuild, no loop)", () => {
  let rebuilds = 0;
  assert.throws(
    () => loadNativeWithRebuild(() => { throw abiErr(); }, () => { rebuilds += 1; }),
    /NODE_MODULE_VERSION/,
  );
  assert.equal(rebuilds, 1); // rebuilt exactly once, then gave up
});
