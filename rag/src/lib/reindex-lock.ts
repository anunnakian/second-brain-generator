import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { CACHE_DIR } from "./config.js";

/** State of a reindex lock held by a process. */
export interface LockState {
  pid: number;
  acquiredAt: string;
}

/** Lock persistence. Injectable for tests. */
export interface LockStorage {
  load(): LockState | null;
  save(state: LockState): void;
  clear(): void;
}

export interface ReindexLockOptions {
  storage?: LockStorage;
  now?: () => Date;
  pid?: number;
  /** Tests whether a process is alive (default: signal 0). */
  isAlive?: (pid: number) => boolean;
  /** Beyond this age, the lock is presumed crashed and reclaimable (default: 30 min). */
  staleAfterMs?: number;
}

/** A full reindex never takes this long: beyond it, the holder is presumed crashed. */
const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;

/**
 * Single-writer lock on the reindex: only one process indexes at a time.
 */
export class ReindexLock {
  private readonly storage: LockStorage;
  private readonly now: () => Date;
  private readonly pid: number;
  private readonly isAlive: (pid: number) => boolean;
  private readonly staleAfterMs: number;

  constructor(opts: ReindexLockOptions = {}) {
    this.storage = opts.storage ?? new FileLockStorage();
    this.now = opts.now ?? (() => new Date());
    this.pid = opts.pid ?? process.pid;
    this.isAlive = opts.isAlive ?? defaultIsAlive;
    this.staleAfterMs = opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  }

  acquire(): boolean {
    const current = this.storage.load();
    const heldByOther = current !== null && current.pid !== this.pid;
    if (heldByOther && this.isActive(current)) {
      return false;
    }
    this.storage.save({ pid: this.pid, acquiredAt: this.now().toISOString() });
    return true;
  }

  release(): void {
    this.storage.clear();
  }

  holder(): LockState | null {
    return this.storage.load();
  }

  /**
   * Holder only if it corresponds to a reindex actually in progress (process
   * alive and lock not stale). An orphaned (dead) or crashed (stale) lock
   * returns `null` — useful to display the state without a false alarm.
   */
  activeHolder(): LockState | null {
    const current = this.storage.load();
    return current !== null && this.isActive(current) ? current : null;
  }

  /** Does the holder correspond to a live process and a non-stale lock? */
  private isActive(state: LockState): boolean {
    return this.isAlive(state.pid) && !this.isStale(state);
  }

  private isStale(state: LockState): boolean {
    const age = this.now().getTime() - new Date(state.acquiredAt).getTime();
    return age > this.staleAfterMs;
  }
}

/** Process alive? `kill(pid, 0)` does not kill: it fails (throws) if the PID does not exist. */
function defaultIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Default persistence: a small JSON file in CACHE_DIR (gitignored, per-machine). */
export class FileLockStorage implements LockStorage {
  private readonly path: string;

  constructor(path: string = resolve(CACHE_DIR, "reindex-lock.json")) {
    this.path = path;
  }

  load(): LockState | null {
    if (!existsSync(this.path)) return null;
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf-8")) as LockState;
      if (typeof parsed.pid === "number" && typeof parsed.acquiredAt === "string") {
        return parsed;
      }
      return null;
    } catch {
      return null; // corrupt file → treated as absent (lock reclaimable)
    }
  }

  save(state: LockState): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(state), "utf-8");
  }

  clear(): void {
    rmSync(this.path, { force: true });
  }
}
