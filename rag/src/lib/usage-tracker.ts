import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { CACHE_DIR } from "./config.js";

/** Consumption state for a given day. */
export interface UsageState {
  /** Day key in YYYY-MM-DD format (in the reference time zone). */
  date: string;
  /** Number of embedding requests consumed that day. */
  count: number;
}

/** Counter persistence. Injectable for tests. */
export interface UsageStorage {
  load(): UsageState | null;
  save(state: UsageState): void;
}

/** Thrown when a consumption would exceed the daily cap. */
export class DailyCapExceededError extends Error {
  constructor(
    public readonly used: number,
    public readonly max: number
  ) {
    super(
      `Daily embedding cap reached (${used}/${max}). ` +
        `Try again tomorrow (the quota resets at midnight Pacific time) ` +
        `or raise MAX_EMBED_REQUESTS_PER_DAY in .env.`
    );
    this.name = "DailyCapExceededError";
  }
}

/** Day key (YYYY-MM-DD) computed in the given time zone. */
export function dayKey(now: Date, timeZone: string): string {
  // en-CA natively produces the YYYY-MM-DD format.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export interface UsageTrackerOptions {
  /** Cap on embedding requests per day. */
  maxPerDay: number;
  /**
   * Credits reserved for priority consumption (search requests).
   * Indexing stops at `maxPerDay − reserveForPriority`; search requests
   * keep access up to `maxPerDay`. Default: 0 (no reserve).
   */
  reserveForPriority?: number;
  /** Reference time zone for the day boundary (default: Pacific, aligned with Gemini). */
  timeZone?: string;
  /** Injectable clock (default: current Date). */
  now?: () => Date;
  /** Injectable persistence (default: JSON file in CACHE_DIR). */
  storage?: UsageStorage;
}

/**
 * Guardrail A: a hard, local cap on the number of embedding requests per day.
 * Independent of the Gemini tier (free or paid), it protects against runaway
 * loops and redundant re-indexing that would burn through the quota / budget.
 *
 * The counter is persisted → shared across processes (MCP server + CLI) and
 * across launches. The day boundary follows the Pacific time zone to align
 * with the Gemini free tier quota reset.
 */
export class UsageTracker {
  private readonly maxPerDay: number;
  private readonly reserveForPriority: number;
  private readonly timeZone: string;
  private readonly now: () => Date;
  private readonly storage: UsageStorage;

  constructor(opts: UsageTrackerOptions) {
    this.maxPerDay = opts.maxPerDay;
    this.reserveForPriority = opts.reserveForPriority ?? 0;
    this.timeZone = opts.timeZone ?? "America/Los_Angeles";
    this.now = opts.now ?? (() => new Date());
    this.storage = opts.storage ?? new FileUsageStorage();
  }

  /** Current day's state — re-reads storage on each call (safe across processes). */
  private currentState(): UsageState {
    const today = dayKey(this.now(), this.timeZone);
    const stored = this.storage.load();
    if (!stored || stored.date !== today) {
      return { date: today, count: 0 };
    }
    return stored;
  }

  usedToday(): number {
    return this.currentState().count;
  }

  remainingToday(): number {
    return Math.max(0, this.maxPerDay - this.currentState().count);
  }

  /** Credits still available for indexing (reserve deducted, floored at 0). */
  remainingForIndexing(): number {
    return Math.max(0, this.indexingCap() - this.currentState().count);
  }

  /** Cap applicable to indexing: the full cap minus the reserve. */
  private indexingCap(): number {
    return this.maxPerDay - this.reserveForPriority;
  }

  /**
   * Indexing consumption: reserves `n` requests under the indexing cap
   * (`maxPerDay − reserve`). Throws DailyCapExceededError beyond it — in which
   * case NOTHING is consumed (logically atomic), leaving the reserve intact
   * for search.
   */
  consume(n = 1): void {
    this.consumeWithCap(n, this.indexingCap());
  }

  /**
   * Priority consumption (search request): may draw from the reserve, so it
   * goes up to the full cap `maxPerDay`. Asking questions is never blocked by
   * indexing.
   */
  consumePriority(n = 1): void {
    this.consumeWithCap(n, this.maxPerDay);
  }

  /** Reserves `n` requests under the given `cap` — nothing if it would exceed it. */
  private consumeWithCap(n: number, cap: number): void {
    const state = this.currentState();
    if (state.count + n > cap) {
      throw new DailyCapExceededError(state.count, cap);
    }
    state.count += n;
    this.storage.save(state);
  }
}

/** Default persistence: a small JSON file in CACHE_DIR (gitignored). */
export class FileUsageStorage implements UsageStorage {
  private readonly path: string;

  constructor(path: string = resolve(CACHE_DIR, "embed-usage.json")) {
    this.path = path;
  }

  load(): UsageState | null {
    if (!existsSync(this.path)) return null;
    try {
      const raw = readFileSync(this.path, "utf-8");
      const parsed = JSON.parse(raw) as UsageState;
      if (typeof parsed.date === "string" && typeof parsed.count === "number") {
        return parsed;
      }
      return null;
    } catch {
      return null; // corrupt file → start from zero rather than crash
    }
  }

  save(state: UsageState): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(state), "utf-8");
  }
}
