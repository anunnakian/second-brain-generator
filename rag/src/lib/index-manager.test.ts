import { test } from "node:test";
import assert from "node:assert/strict";
import { reindex, runIndexingPhase } from "./index-manager.js";
import { ReindexLock, type LockState, type LockStorage } from "./reindex-lock.js";
import { ReindexReporter, type ProgressStorage } from "./reindex-reporter.js";
import type { PreparedDoc, IndexPorts } from "./indexer.js";
import type { RunProgress } from "./progress-report.js";
import type { Embedder } from "./embedder.js";

// Minimal prepared doc with n chunks.
function doc(path: string, nChunks: number): PreparedDoc {
  return {
    relativePath: path,
    title: path,
    type: "topic",
    tags: [],
    hash: `hash-${path}`,
    chunks: Array.from({ length: nChunks }, (_, i) => ({
      section: `s${i}`,
      content: `${path}#${i}`,
      chunkIndex: i,
    })),
  };
}

const fakeEmbed: IndexPorts["embed"] = async (texts) => texts.map(() => [0.1, 0.2]);

// In-memory progress storage.
function memProgressStorage() {
  let state: RunProgress | null = null;
  const storage: ProgressStorage = {
    load: () => state,
    save: (s) => {
      state = s;
    },
  };
  return storage;
}

// Pre-filled in-memory storage — simulates a lock already held, without touching the FS.
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

test("reindex locked by another live process: no-op, zero embedding", async () => {
  const storage = new MemStorage({
    pid: 999,
    acquiredAt: "2026-05-31T17:59:00Z", // fresh → not stale
  });
  const lock = new ReindexLock({
    storage,
    pid: 1234,
    isAlive: () => true, // 999 is alive
    now: () => new Date("2026-05-31T18:00:00Z"),
  });

  let embedCalls = 0;
  const embedderSpy: Embedder = {
    identity: { providerId: "fake", model: "spy", dimension: 2 },
    embedDocuments: async (texts) => {
      embedCalls++;
      return texts.map(() => [0, 0]);
    },
    embedQuery: async () => [0, 0],
  };

  const result = await reindex(false, { lock, embedder: embedderSpy });

  assert.equal(result.skippedLocked, true);
  assert.equal(embedCalls, 0); // embedding was never triggered
  assert.equal(storage.load()?.pid, 999); // the other process keeps the lock
});

test("runIndexingPhase: start → tick per doc → finish done", async () => {
  const storage = memProgressStorage();
  const reporter = new ReindexReporter({
    storage,
    now: () => new Date("2026-05-31T18:00:00Z"),
  });

  const result = await runIndexingPhase(
    [doc("a.md", 2), doc("b.md", 3)],
    { embed: fakeEmbed, persist: () => {} },
    reporter,
    { scanned: 5, skipped: 3, removed: 0 }
  );

  assert.equal(result.indexed, 2);
  const final = storage.load();
  assert.equal(final?.status, "done");
  assert.equal(final?.totalChunks, 5);
  assert.equal(final?.doneChunks, 5);
  assert.equal(final?.indexed, 2);
  assert.equal(final?.skipped, 3);
  assert.equal(final?.hitCap, false);
  assert.equal(final?.wallReason, null);
});

test("runIndexingPhase: quota wall → finish incomplete + hitCap", async () => {
  const storage = memProgressStorage();
  const reporter = new ReindexReporter({
    storage,
    now: () => new Date("2026-05-31T18:00:00Z"),
  });

  // Embedding throws a DailyCapExceededError on the 2nd doc.
  let calls = 0;
  const embedCap: IndexPorts["embed"] = async (texts) => {
    calls++;
    if (calls === 2) {
      const err = new Error("Daily cap...");
      err.name = "DailyCapExceededError";
      throw err;
    }
    return texts.map(() => [0.1, 0.2]);
  };

  await runIndexingPhase(
    [doc("a.md", 2), doc("b.md", 3)],
    { embed: embedCap, persist: () => {} },
    reporter,
    { scanned: 5, skipped: 0, removed: 0 }
  );

  const final = storage.load();
  assert.equal(final?.status, "incomplete");
  assert.equal(final?.hitCap, true);
  assert.equal(final?.doneChunks, 2); // only a.md (2 chunks) went through
  assert.equal(final?.errors.length, 1);
  assert.equal(final?.wallReason, "local-cap");
});

test("runIndexingPhase: Google wall (429) → finish incomplete + hitCap (not a successful run)", async () => {
  const storage = memProgressStorage();
  const reporter = new ReindexReporter({
    storage,
    now: () => new Date("2026-05-31T18:00:00Z"),
  });

  // The real Google wall is hit first (Google's limit below ours): 429
  // RESOURCE_EXHAUSTED thrown by the embedder after its retries. This is NOT a
  // local DailyCapExceededError — but it's still an incomplete run to be resumed.
  let calls = 0;
  const embed429: IndexPorts["embed"] = async (texts) => {
    calls++;
    if (calls === 2) {
      throw new Error("got status: 429 RESOURCE_EXHAUSTED — Google quota");
    }
    return texts.map(() => [0.1, 0.2]);
  };

  await runIndexingPhase(
    [doc("a.md", 2), doc("b.md", 3)],
    { embed: embed429, persist: () => {} },
    reporter,
    { scanned: 5, skipped: 0, removed: 0 }
  );

  const final = storage.load();
  assert.equal(final?.status, "incomplete");
  assert.equal(final?.hitCap, true);
  assert.equal(final?.wallReason, "google-rate-limit");
});
