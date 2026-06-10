export type RunStatus = "running" | "done" | "incomplete" | "error";

/**
 * Which wall interrupted indexing (null = none):
 * - "local-cap"         : our MAX_EMBED_REQUESTS_PER_DAY guardrail (DailyCapExceededError).
 * - "google-rate-limit" : the remote Gemini wall (429 RESOURCE_EXHAUSTED).
 * Distinguishing the two lets us surface the real cause, whichever is lower.
 */
export type WallReason = "local-cap" | "google-rate-limit" | null;

/** Shared resume phrasing (incomplete status) — single source, reused by status-report. */
export const RESUME_HINT = "auto-resume on the next session";

export interface RunProgress {
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  totalChunks: number;
  doneChunks: number;
  scanned: number;
  indexed: number;
  skipped: number;
  removed: number;
  errors: string[];
  hitCap: boolean;
  wallReason?: WallReason;
}

/** Human-readable markdown document (openable/tailable) summarizing the last catch-up run. */
export function formatLastRunMarkdown(state: RunProgress, now: string): string {
  return `# Last RAG catch-up run\n\n_Generated on ${now}_\n\n${formatProgressReport(state, now)}\n`;
}

/** Human-readable report of a catch-up run (pure function). */
export function formatProgressReport(state: RunProgress, now: string): string {
  if (state.status === "done") return formatDone(state);
  if (state.status === "incomplete") return formatIncomplete(state);
  return formatRunning(state, now);
}

function formatIncomplete(state: RunProgress): string {
  const remaining = state.totalChunks - state.doneChunks;
  const cause = state.hitCap ? " (quota wall)" : "";
  return (
    `Last catch-up: incomplete${cause}, ${remaining} chunks remaining, ${RESUME_HINT}.` +
    formatErrors(state.errors)
  );
}

/** Truncated list of errors (3 max + count of the rest), empty if none. */
function formatErrors(errors: string[], max = 3): string {
  if (errors.length === 0) return "";
  const shown = errors.slice(0, max).join(", ");
  const rest = errors.length - max;
  const more = rest > 0 ? ` (+${rest} other(s))` : "";
  return ` Errors: ${shown}${more}.`;
}

function formatDone(state: RunProgress): string {
  const durationMin = state.finishedAt
    ? Math.round(minutesBetween(state.startedAt, state.finishedAt))
    : 0;
  return `Last catch-up: completed in ${durationMin} min, ${state.indexed} docs indexed, ${state.errors.length} error(s).`;
}

/** Minutes elapsed between two ISO instants (may be fractional). */
function minutesBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 60_000;
}

function formatRunning(state: RunProgress, now: string): string {
  const pct = Math.round((state.doneChunks / state.totalChunks) * 100);
  const rate = Math.round(
    chunksPerMinute({ doneChunks: state.doneChunks, startedAt: state.startedAt, now }),
  );
  const eta = etaMinutes({
    totalChunks: state.totalChunks,
    doneChunks: state.doneChunks,
    ratePerMin: rate,
  });
  const etaPart = eta === null ? "ETA unknown" : `ETA ~${Math.round(eta)} min`;
  return `Catch-up in progress: ${state.doneChunks}/${state.totalChunks} chunks (${pct} %), ~${rate}/min, ${etaPart}, ${state.errors.length} error(s).`;
}

export interface RateInput {
  doneChunks: number;
  startedAt: string;
  now: string;
}

/** Throughput in chunks/minute (pure function). */
export function chunksPerMinute(input: RateInput): number {
  const elapsedMin = minutesBetween(input.startedAt, input.now);
  if (elapsedMin <= 0) return 0;
  return input.doneChunks / elapsedMin;
}

export interface EtaInput {
  totalChunks: number;
  doneChunks: number;
  ratePerMin: number;
}

/** Estimated minutes remaining, or `null` if throughput is zero (pure function). */
export function etaMinutes(input: EtaInput): number | null {
  if (input.ratePerMin <= 0) return null;
  const remaining = input.totalChunks - input.doneChunks;
  return remaining / input.ratePerMin;
}
