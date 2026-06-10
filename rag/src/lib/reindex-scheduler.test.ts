import { test } from "node:test";
import assert from "node:assert/strict";
import { ReindexScheduler } from "./reindex-scheduler.js";

/**
 * Fake timer: captures the single pending callback (the debounce only keeps
 * one timer at a time — each notify cancels the previous one). `fire()`
 * triggers it manually, without a real clock.
 */
type Handle = ReturnType<typeof setTimeout>;

function fakeTimer() {
  const timers = new Map<number, () => void>();
  let nextId = 1;
  return {
    set(fn: () => void, _ms: number): Handle {
      const id = nextId++;
      timers.set(id, fn);
      return id as unknown as Handle;
    },
    clear(handle: Handle) {
      timers.delete(handle as unknown as number);
    },
    /** Fires all timers still active (reveals a missing clear). */
    fire() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((cb) => cb());
    },
    hasPending() {
      return timers.size > 0;
    },
  };
}

/**
 * Controllable run: each call returns a promise we resolve by hand, to
 * simulate a reindex "in progress" and trigger a notify while it runs.
 */
function controllableRun() {
  const resolvers: Array<() => void> = [];
  let calls = 0;
  return {
    run: () => {
      calls++;
      return new Promise<void>((resolve) => resolvers.push(resolve));
    },
    /** Completes the oldest run and lets the post-await continuations run. */
    async completeOne() {
      resolvers.shift()?.();
      for (let i = 0; i < 5; i++) await Promise.resolve();
    },
    calls: () => calls,
  };
}

test("F.1 — notify does not run the reindex right away, it schedules it (pending timer)", () => {
  let runs = 0;
  const timer = fakeTimer();
  const scheduler = new ReindexScheduler({
    run: async () => {
      runs++;
    },
    debounceMs: 5000,
    setTimer: timer.set,
    clearTimer: timer.clear,
  });

  scheduler.notify();

  assert.equal(runs, 0);
  assert.ok(timer.hasPending());
});

test("F.1 — when the timer fires, the reindex runs once", () => {
  let runs = 0;
  const timer = fakeTimer();
  const scheduler = new ReindexScheduler({
    run: async () => {
      runs++;
    },
    debounceMs: 5000,
    setTimer: timer.set,
    clearTimer: timer.clear,
  });

  scheduler.notify();
  timer.fire();

  assert.equal(runs, 1);
});

test("F.1 — a burst of notify is coalesced into a single reindex (debounce)", () => {
  let runs = 0;
  const timer = fakeTimer();
  const scheduler = new ReindexScheduler({
    run: async () => {
      runs++;
    },
    debounceMs: 5000,
    setTimer: timer.set,
    clearTimer: timer.clear,
  });

  scheduler.notify();
  scheduler.notify();
  scheduler.notify();
  timer.fire();

  assert.equal(runs, 1);
});

test("F.2 — a notify during a run → exactly one rerun at the end (never in parallel)", async () => {
  const ctrl = controllableRun();
  const timer = fakeTimer();
  const scheduler = new ReindexScheduler({
    run: ctrl.run,
    debounceMs: 5000,
    setTimer: timer.set,
    clearTimer: timer.clear,
  });

  scheduler.notify();
  timer.fire(); // run #1 starts and stays in progress
  assert.equal(ctrl.calls(), 1);

  scheduler.notify();
  timer.fire(); // write during the run → no parallel run
  assert.equal(ctrl.calls(), 1);

  await ctrl.completeOne(); // run #1 done → the pending rerun starts
  assert.equal(ctrl.calls(), 2);

  await ctrl.completeOne(); // run #2 done → nothing left pending
  assert.equal(ctrl.calls(), 2);
});

test("F.2 — N writes during a run are merged into a single rerun", async () => {
  const ctrl = controllableRun();
  const timer = fakeTimer();
  const scheduler = new ReindexScheduler({
    run: ctrl.run,
    debounceMs: 5000,
    setTimer: timer.set,
    clearTimer: timer.clear,
  });

  scheduler.notify();
  timer.fire(); // run #1 in progress
  for (let i = 0; i < 4; i++) {
    scheduler.notify();
    timer.fire(); // 4 writes during the run
  }
  assert.equal(ctrl.calls(), 1);

  await ctrl.completeOne(); // → a single rerun, not four
  assert.equal(ctrl.calls(), 2);

  await ctrl.completeOne(); // nothing left pending
  assert.equal(ctrl.calls(), 2);
});

test("F.2 — without a write during the run, no rerun (idle → 0)", async () => {
  const ctrl = controllableRun();
  const timer = fakeTimer();
  const scheduler = new ReindexScheduler({
    run: ctrl.run,
    debounceMs: 5000,
    setTimer: timer.set,
    clearTimer: timer.clear,
  });

  scheduler.notify();
  timer.fire();
  await ctrl.completeOne();

  assert.equal(ctrl.calls(), 1);
});

test("F.live — a fresh scheduler is idle (nothing scheduled, nothing running)", () => {
  const timer = fakeTimer();
  const scheduler = new ReindexScheduler({
    run: async () => {},
    debounceMs: 5000,
    setTimer: timer.set,
    clearTimer: timer.clear,
  });

  assert.deepEqual(scheduler.state(), {
    scheduled: false,
    running: false,
    pending: false,
  });
});

test("F.live — after notify, a reindex is scheduled, not yet running", () => {
  const timer = fakeTimer();
  const scheduler = new ReindexScheduler({
    run: async () => {},
    debounceMs: 5000,
    setTimer: timer.set,
    clearTimer: timer.clear,
  });

  scheduler.notify();

  assert.deepEqual(scheduler.state(), {
    scheduled: true,
    running: false,
    pending: false,
  });
});

test("F.live — during a run: running, and a write during the run → pending", async () => {
  const ctrl = controllableRun();
  const timer = fakeTimer();
  const scheduler = new ReindexScheduler({
    run: ctrl.run,
    debounceMs: 5000,
    setTimer: timer.set,
    clearTimer: timer.clear,
  });

  scheduler.notify();
  timer.fire(); // run in progress
  assert.deepEqual(scheduler.state(), {
    scheduled: false,
    running: true,
    pending: false,
  });

  scheduler.notify();
  timer.fire(); // write during the run → rerun pending
  assert.deepEqual(scheduler.state(), {
    scheduled: false,
    running: true,
    pending: true,
  });

  await ctrl.completeOne(); // run + rerun consumed → back to idle
  await ctrl.completeOne();
  assert.deepEqual(scheduler.state(), {
    scheduled: false,
    running: false,
    pending: false,
  });
});
