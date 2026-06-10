import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UsageTracker,
  DailyCapExceededError,
  dayKey,
  type UsageState,
  type UsageStorage,
} from "./usage-tracker.js";

// In-memory storage — decouples tests from the file system.
class MemStorage implements UsageStorage {
  state: UsageState | null;
  constructor(initial: UsageState | null = null) {
    this.state = initial;
  }
  load(): UsageState | null {
    return this.state;
  }
  save(s: UsageState): void {
    this.state = { ...s };
  }
}

const PT = "America/Los_Angeles";
const at = (iso: string) => () => new Date(iso);

test("fresh tracker: full quota available", () => {
  const t = new UsageTracker({
    maxPerDay: 1000,
    timeZone: PT,
    now: at("2026-05-30T18:00:00Z"),
    storage: new MemStorage(),
  });
  assert.equal(t.usedToday(), 0);
  assert.equal(t.remainingToday(), 1000);
});

test("consume decrements the remaining", () => {
  const t = new UsageTracker({
    maxPerDay: 1000,
    timeZone: PT,
    now: at("2026-05-30T18:00:00Z"),
    storage: new MemStorage(),
  });
  t.consume(10);
  assert.equal(t.usedToday(), 10);
  assert.equal(t.remainingToday(), 990);
});

test("consume up to the cap is OK, beyond it throws", () => {
  const t = new UsageTracker({
    maxPerDay: 5,
    timeZone: PT,
    now: at("2026-05-30T18:00:00Z"),
    storage: new MemStorage(),
  });
  t.consume(5);
  assert.equal(t.remainingToday(), 0);
  assert.throws(() => t.consume(1), DailyCapExceededError);
});

test("a consume that would exceed consumes NOTHING (no half-consumption)", () => {
  const storage = new MemStorage();
  const t = new UsageTracker({
    maxPerDay: 5,
    timeZone: PT,
    now: at("2026-05-30T18:00:00Z"),
    storage,
  });
  t.consume(3);
  assert.throws(() => t.consume(5), DailyCapExceededError); // 3 + 5 > 5
  assert.equal(t.usedToday(), 3); // unchanged
});

test("the counter resets at the day boundary (PT)", () => {
  let clock = new Date("2026-05-30T18:00:00Z");
  const t = new UsageTracker({
    maxPerDay: 1000,
    timeZone: PT,
    now: () => clock,
    storage: new MemStorage(),
  });
  t.consume(900);
  assert.equal(t.usedToday(), 900);
  clock = new Date("2026-05-31T18:00:00Z"); // next day
  assert.equal(t.usedToday(), 0);
  assert.equal(t.remainingToday(), 1000);
});

test("state persists across two instances via storage", () => {
  const storage = new MemStorage();
  const now = at("2026-05-30T18:00:00Z");
  new UsageTracker({ maxPerDay: 1000, timeZone: PT, now, storage }).consume(42);
  const t2 = new UsageTracker({ maxPerDay: 1000, timeZone: PT, now, storage });
  assert.equal(t2.usedToday(), 42);
});

test("indexing consumption: throws when count + n exceeds maxPerDay − reserve", () => {
  const t = new UsageTracker({
    maxPerDay: 10,
    reserveForPriority: 3,
    timeZone: PT,
    now: at("2026-05-30T18:00:00Z"),
    storage: new MemStorage(),
  });
  t.consume(7); // 7 == 10 − 3, the indexing cap is reached
  assert.throws(() => t.consume(1), DailyCapExceededError);
});

test("priority consumption: can go up to maxPerDay, ignores the reserve", () => {
  const t = new UsageTracker({
    maxPerDay: 10,
    reserveForPriority: 3,
    timeZone: PT,
    now: at("2026-05-30T18:00:00Z"),
    storage: new MemStorage(),
  });
  t.consume(7); // indexing up to the indexing cap (10 − 3)
  // a priority request draws from the reserve: 7 + 3 == 10 OK
  assert.doesNotThrow(() => t.consumePriority(3));
  assert.equal(t.usedToday(), 10);
  // but beyond the full cap, it throws
  assert.throws(() => t.consumePriority(1), DailyCapExceededError);
});

test("remainingForIndexing reflects the reserve, floored at 0", () => {
  const t = new UsageTracker({
    maxPerDay: 10,
    reserveForPriority: 3,
    timeZone: PT,
    now: at("2026-05-30T18:00:00Z"),
    storage: new MemStorage(),
  });
  assert.equal(t.remainingForIndexing(), 7); // 10 − 3 − 0
  t.consume(5);
  assert.equal(t.remainingForIndexing(), 2); // 10 − 3 − 5
  // a priority request draws from the reserve → indexing runs dry
  t.consumePriority(3);
  assert.equal(t.remainingForIndexing(), 0); // floored, not negative
});

test("dayKey correctly uses the Pacific time zone boundary", () => {
  // 2026-05-30T05:00Z = 2026-05-29 22:00 PDT → still the 29th in PT
  assert.equal(dayKey(new Date("2026-05-30T05:00:00Z"), PT), "2026-05-29");
  // 2026-05-30T18:00Z = 2026-05-30 11:00 PDT → the 30th
  assert.equal(dayKey(new Date("2026-05-30T18:00:00Z"), PT), "2026-05-30");
});
