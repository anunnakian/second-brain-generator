import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  ReindexLock,
  FileLockStorage,
  type LockState,
  type LockStorage,
} from "./reindex-lock.js";

// In-memory storage — decouples the tests from the file system.
class MemStorage implements LockStorage {
  state: LockState | null;
  constructor(initial: LockState | null = null) {
    this.state = initial;
  }
  load(): LockState | null {
    return this.state;
  }
  save(s: LockState): void {
    this.state = { ...s };
  }
  clear(): void {
    this.state = null;
  }
}

const at = (iso: string) => () => new Date(iso);

test("fresh lock: acquire() succeeds and holder().pid = our PID", () => {
  const lock = new ReindexLock({
    storage: new MemStorage(),
    now: at("2026-05-31T18:00:00Z"),
    pid: 1234,
  });
  assert.equal(lock.acquire(), true);
  assert.equal(lock.holder()?.pid, 1234);
});

test("lock held by another live process: acquire() returns false", () => {
  const lock = new ReindexLock({
    storage: new MemStorage({ pid: 999, acquiredAt: "2026-05-31T17:55:00Z" }),
    now: at("2026-05-31T18:00:00Z"), // recent lock (5 min) → not stale
    pid: 1234,
    isAlive: () => true,
  });
  assert.equal(lock.acquire(), false);
  assert.equal(lock.holder()?.pid, 999); // the other one keeps the lock
});

test("lock held by a dead process: reclaim → acquire() true", () => {
  const lock = new ReindexLock({
    storage: new MemStorage({ pid: 999, acquiredAt: "2026-05-31T17:00:00Z" }),
    now: at("2026-05-31T18:00:00Z"),
    pid: 1234,
    isAlive: () => false, // 999 no longer exists
  });
  assert.equal(lock.acquire(), true);
  assert.equal(lock.holder()?.pid, 1234); // we took over the lock
});

test("stale lock (older than staleAfterMs): reclaim even if the PID is alive", () => {
  const lock = new ReindexLock({
    // acquired 2h ago; a reindex never takes this long → presumed crashed
    storage: new MemStorage({ pid: 999, acquiredAt: "2026-05-31T16:00:00Z" }),
    now: at("2026-05-31T18:00:00Z"),
    pid: 1234,
    isAlive: () => true, // PID reused by an unrelated process
    staleAfterMs: 10 * 60 * 1000, // 10 min
  });
  assert.equal(lock.acquire(), true);
  assert.equal(lock.holder()?.pid, 1234);
});

test("release() frees the lock: holder() null, next acquire() true", () => {
  const lock = new ReindexLock({
    storage: new MemStorage(),
    now: at("2026-05-31T18:00:00Z"),
    pid: 1234,
  });
  lock.acquire();
  lock.release();
  assert.equal(lock.holder(), null);
  assert.equal(lock.acquire(), true);
});

test("re-entrant: the same PID can re-acquire (no self-deadlock)", () => {
  const lock = new ReindexLock({
    storage: new MemStorage(),
    now: at("2026-05-31T18:00:00Z"),
    pid: 1234,
    isAlive: () => true, // our own PID is alive
  });
  assert.equal(lock.acquire(), true);
  assert.equal(lock.acquire(), true); // idempotent re-acquisition
  assert.equal(lock.holder()?.pid, 1234);
});

test("activeHolder(): lock held by a live, recent process → returns the holder", () => {
  const lock = new ReindexLock({
    storage: new MemStorage({ pid: 999, acquiredAt: "2026-05-31T17:55:00Z" }),
    now: at("2026-05-31T18:00:00Z"), // 5 min → not stale
    pid: 1234,
    isAlive: () => true,
  });
  assert.equal(lock.activeHolder()?.pid, 999);
});

test("activeHolder(): dead holder → null (no reindex actually in progress)", () => {
  const lock = new ReindexLock({
    storage: new MemStorage({ pid: 999, acquiredAt: "2026-05-31T17:55:00Z" }),
    now: at("2026-05-31T18:00:00Z"),
    pid: 1234,
    isAlive: () => false,
  });
  assert.equal(lock.activeHolder(), null);
});

test("activeHolder(): stale holder → null even if the PID is alive", () => {
  const lock = new ReindexLock({
    storage: new MemStorage({ pid: 999, acquiredAt: "2026-05-31T16:00:00Z" }),
    now: at("2026-05-31T18:00:00Z"),
    pid: 1234,
    isAlive: () => true,
    staleAfterMs: 10 * 60 * 1000,
  });
  assert.equal(lock.activeHolder(), null);
});

test("activeHolder(): no lock → null", () => {
  const lock = new ReindexLock({
    storage: new MemStorage(),
    now: at("2026-05-31T18:00:00Z"),
    pid: 1234,
  });
  assert.equal(lock.activeHolder(), null);
});

test("now omitted → a real Date clock: acquire stamps a valid ISO timestamp", () => {
  // Reflex #4: the tests always inject `now`, so the `() => new Date()` default never
  // ran. A `() => undefined` mutant makes now().toISOString() throw — omitting `now`
  // and acquiring pins the default to a working clock.
  const storage = new MemStorage();
  assert.equal(new ReindexLock({ storage, pid: 1234 }).acquire(), true);
  assert.match(storage.state!.acquiredAt, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
});

test("staleAfterMs omitted → defaults to 30 min (a 2h-old live lock is stale, reclaimable)", () => {
  // A `?? DEFAULT` → `&& DEFAULT` mutant leaves staleAfterMs undefined (age > undefined
  // is always false → never stale), so the reclaim would fail. Default 30min → 2h stale.
  const lock = new ReindexLock({
    storage: new MemStorage({ pid: 999, acquiredAt: "2026-05-31T16:00:00Z" }),
    now: at("2026-05-31T18:00:00Z"),
    pid: 1234,
    isAlive: () => true,
  });
  assert.equal(lock.acquire(), true);
});

test("isStale boundary: age exactly at staleAfterMs is NOT stale (the > boundary)", () => {
  // acquired 18:00, now 18:10, staleAfterMs 10min → age == staleAfterMs. `age >
  // staleAfterMs` is false (still active); a `>=` mutant flips it to stale and reclaims.
  const lock = new ReindexLock({
    storage: new MemStorage({ pid: 999, acquiredAt: "2026-05-31T18:00:00Z" }),
    now: at("2026-05-31T18:10:00Z"),
    pid: 1234,
    isAlive: () => true,
    staleAfterMs: 10 * 60 * 1000,
  });
  assert.equal(lock.activeHolder()?.pid, 999); // exactly at the boundary → still active
  assert.equal(lock.acquire(), false); // a non-stale live lock can't be reclaimed
});

test("isAlive omitted → the real process check: our own live PID is an active holder", () => {
  // Exercises the private defaultIsAlive (process.kill(pid, 0)) via the public API:
  // our own PID is alive → an active holder. Kills the true→false / empty-body mutants.
  const lock = new ReindexLock({
    storage: new MemStorage({ pid: process.pid, acquiredAt: "2026-05-31T17:59:30Z" }),
    now: at("2026-05-31T18:00:00Z"), // 30s → not stale
  });
  assert.equal(lock.activeHolder()?.pid, process.pid);
});

test("isAlive omitted → a non-existent PID is not alive → no active holder", () => {
  const DEAD_PID = 2 ** 30; // no such process → process.kill throws → not alive
  const lock = new ReindexLock({
    storage: new MemStorage({ pid: DEAD_PID, acquiredAt: "2026-05-31T17:59:30Z" }),
    now: at("2026-05-31T18:00:00Z"),
  });
  assert.equal(lock.activeHolder(), null);
});

test("FileLockStorage: a corrupt file loads as null (reclaimable, never crashes)", () => {
  const path = resolve(tmpdir(), `reindex-lock-corrupt-${process.pid}.json`);
  try {
    writeFileSync(path, "not json {{", "utf-8");
    assert.equal(new FileLockStorage(path).load(), null);
  } finally {
    rmSync(path, { force: true });
  }
});

test("FileLockStorage: well-formed JSON of the WRONG shape loads as null (both && sides)", () => {
  // Reflex #3: twins around `typeof pid === "number" && typeof acquiredAt === "string"`.
  const path = resolve(tmpdir(), `reindex-lock-shape-${process.pid}.json`);
  try {
    const storage = new FileLockStorage(path);
    writeFileSync(path, JSON.stringify({ pid: "1234", acquiredAt: "2026-05-31T18:00:00Z" }), "utf-8");
    assert.equal(storage.load(), null); // pid not a number
    writeFileSync(path, JSON.stringify({ pid: 1234, acquiredAt: 20260531 }), "utf-8");
    assert.equal(storage.load(), null); // acquiredAt not a string
  } finally {
    rmSync(path, { force: true });
  }
});

test("FileLockStorage: clear() on an absent file does not throw (the force flag)", () => {
  const path = resolve(tmpdir(), `reindex-lock-absent-${process.pid}.json`);
  rmSync(path, { force: true }); // ensure absent
  // rmSync without { force: true } throws ENOENT on a missing path.
  assert.doesNotThrow(() => new FileLockStorage(path).clear());
});

test("FileLockStorage: round-trip load/save/clear on a temp file", () => {
  const path = resolve(tmpdir(), `reindex-lock-test-${process.pid}.json`);
  rmSync(path, { force: true });
  const storage = new FileLockStorage(path);
  try {
    assert.equal(storage.load(), null); // empty to start with
    const state: LockState = { pid: 1234, acquiredAt: "2026-05-31T18:00:00Z" };
    storage.save(state);
    assert.deepEqual(storage.load(), state);
    storage.clear();
    assert.equal(storage.load(), null);
    assert.equal(existsSync(path), false);
  } finally {
    rmSync(path, { force: true });
  }
});
