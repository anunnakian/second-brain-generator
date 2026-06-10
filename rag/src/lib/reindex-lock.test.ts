import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
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
