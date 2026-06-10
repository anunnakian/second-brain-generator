export type TimerHandle = ReturnType<typeof setTimeout>;

export interface ReindexSchedulerOptions {
  /** The actual reindex to trigger (injected). */
  run: () => Promise<unknown>;
  /** Window for coalescing a burst of writes (default: 5 s). */
  debounceMs?: number;
  /** Scheduling a timer (default: global setTimeout). */
  setTimer?: (fn: () => void, ms: number) => TimerHandle;
  /** Cancelling a timer (default: global clearTimeout). */
  clearTimer?: (handle: TimerHandle) => void;
}

const DEFAULT_DEBOUNCE_MS = 5000;

/** Snapshot of the scheduler's in-memory state (real-time liveness). */
export interface SchedulerState {
  /** A reindex is scheduled (debounce armed), not yet started. */
  scheduled: boolean;
  /** A reindex is currently running. */
  running: boolean;
  /** A write occurred during the run → a rerun is pending. */
  pending: boolean;
}

/**
 * Incremental reindex scheduler: coalesces a burst of writes (debounce) into a
 * single reindex. Pure/injectable logic — the filesystem watcher (chokidar)
 * stays a thin I/O layer on top.
 */
export class ReindexScheduler {
  private readonly run: () => Promise<unknown>;
  private readonly debounceMs: number;
  private readonly setTimer: (fn: () => void, ms: number) => TimerHandle;
  private readonly clearTimer: (handle: TimerHandle) => void;
  private timer: TimerHandle | null = null;
  private running = false;
  private pending = false;

  constructor(opts: ReindexSchedulerOptions) {
    this.run = opts.run;
    this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h));
  }

  /** Current in-memory state — to expose liveness (watcher active on the server side). */
  state(): SchedulerState {
    return {
      scheduled: this.timer !== null,
      running: this.running,
      pending: this.pending,
    };
  }

  /** Signals a write in the vault → (re)schedules a debounced reindex. */
  notify(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
    }
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.trigger();
    }, this.debounceMs);
  }

  /**
   * Starts a run, unless one is already in progress: in that case we set a
   * `pending` flag (coalescing) to rerun exactly once at the end — never in
   * parallel, never a lost trigger.
   */
  private trigger(): void {
    if (this.running) {
      this.pending = true;
      return;
    }
    this.running = true;
    void Promise.resolve(this.run()).finally(() => {
      this.running = false;
      if (this.pending) {
        this.pending = false;
        this.trigger();
      }
    });
  }
}
