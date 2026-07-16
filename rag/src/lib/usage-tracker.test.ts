import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  UsageTracker,
  DailyCapExceededError,
  FileUsageStorage,
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

test("DailyCapExceededError carries used/max, its name, and the full guidance message", () => {
  // Reflex #1/#2: the older `assert.throws(…, DailyCapExceededError)` tests never
  // matched the message, so every string fragment (and the `name`) survived. Assert
  // the exact message and both fields.
  const err = new DailyCapExceededError(5, 7);
  assert.equal(err.used, 5);
  assert.equal(err.max, 7);
  assert.equal(err.name, "DailyCapExceededError");
  assert.equal(
    err.message,
    "Daily embedding cap reached (5/7). Try again tomorrow (the quota resets at midnight Pacific time) or raise MAX_EMBED_REQUESTS_PER_DAY in .env.",
  );
});

test("a custom timeZone is honored, not silently swapped for the Pacific default", () => {
  // tz="UTC" with a clock at 05:00Z: the UTC day is the 30th, the Pacific day the 29th.
  // A state seeded for the 30th reads as "today" ONLY under UTC — so a `?? ` → `&&`
  // mutant (which would force the LA default) reads the 29th, sees no match, returns 0.
  const t = new UsageTracker({
    maxPerDay: 100,
    timeZone: "UTC",
    now: at("2026-05-30T05:00:00Z"),
    storage: new MemStorage({ date: "2026-05-30", count: 5 }),
  });
  assert.equal(t.usedToday(), 5);
});

test("timeZone omitted → defaults to Pacific (America/Los_Angeles)", () => {
  // Reflex #4 (absent twin): no timeZone. At 05:00Z the Pacific day is the 29th, so a
  // state seeded for the 29th reads as today. A `?? ""` mutant makes the tz invalid and
  // the day computation throw — so this pins the default value, not just its presence.
  const t = new UsageTracker({
    maxPerDay: 100,
    now: at("2026-05-30T05:00:00Z"),
    storage: new MemStorage({ date: "2026-05-29", count: 7 }),
  });
  assert.equal(t.usedToday(), 7);
});

test("FileUsageStorage: save then load round-trips the state through a real file", () => {
  // Reflex #6: the file I/O was never exercised (all tests used MemStorage), so the
  // whole load/save body survived. Drive it on a real temp file via the injectable
  // path. The temp dir already exists, so an mkdir without `recursive` throws EEXIST —
  // which is exactly what kills the `{ recursive: true }` / `"utf-8"` mutants at save.
  const dir = mkdtempSync(join(tmpdir(), "usage-"));
  const path = join(dir, "embed-usage.json");
  try {
    new FileUsageStorage(path).save({ date: "2026-05-30", count: 7 });
    assert.equal(existsSync(path), true);
    assert.deepEqual(new FileUsageStorage(path).load(), { date: "2026-05-30", count: 7 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FileUsageStorage: a missing file loads as null (no crash)", () => {
  const dir = mkdtempSync(join(tmpdir(), "usage-"));
  try {
    assert.equal(new FileUsageStorage(join(dir, "absent.json")).load(), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FileUsageStorage: a corrupt file loads as null (start-from-zero, never crashes)", () => {
  const dir = mkdtempSync(join(tmpdir(), "usage-"));
  const path = join(dir, "embed-usage.json");
  try {
    writeFileSync(path, "{ not valid json", "utf-8");
    assert.equal(new FileUsageStorage(path).load(), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FileUsageStorage: well-formed JSON of the WRONG shape loads as null (both && sides)", () => {
  // Reflex #3: two twins around the `typeof date === "string" && typeof count === "number"`
  // guard — date-valid/count-invalid and date-invalid/count-valid — so `&&`→`||`, each
  // `===`→`!==` and each type-string mutant flips exactly one side and gets caught.
  const dir = mkdtempSync(join(tmpdir(), "usage-"));
  const path = join(dir, "embed-usage.json");
  try {
    const storage = new FileUsageStorage(path);
    writeFileSync(path, JSON.stringify({ date: "2026-05-30", count: "seven" }), "utf-8");
    assert.equal(storage.load(), null); // count not a number
    writeFileSync(path, JSON.stringify({ date: 20260530, count: 7 }), "utf-8");
    assert.equal(storage.load(), null); // date not a string
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dayKey correctly uses the Pacific time zone boundary", () => {
  // 2026-05-30T05:00Z = 2026-05-29 22:00 PDT → still the 29th in PT
  assert.equal(dayKey(new Date("2026-05-30T05:00:00Z"), PT), "2026-05-29");
  // 2026-05-30T18:00Z = 2026-05-30 11:00 PDT → the 30th
  assert.equal(dayKey(new Date("2026-05-30T18:00:00Z"), PT), "2026-05-30");
});
