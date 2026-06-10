import type { LockState } from "./reindex-lock.js";
import { formatProgressReport, RESUME_HINT, type RunProgress } from "./progress-report.js";
import type { SchedulerState } from "./reindex-scheduler.js";

/**
 * Liveness line for the live-stream watcher (real-time in-memory state of the
 * MCP server): active or not, and what it's doing right now. Pure function.
 */
export function formatWatcherLiveness(input: {
  active: boolean;
  state?: SchedulerState | null;
}): string {
  if (!input.active) return "Live-stream watcher: inactive.";
  const state = input.state;
  if (state?.running) {
    const suffix = state.pending ? " (burst pending)" : "";
    return `Live-stream watcher: active — reindex in progress${suffix}.`;
  }
  if (state?.scheduled) {
    return "Live-stream watcher: active — write detected, reindex scheduled (debounce).";
  }
  return "Live-stream watcher: active (idle).";
}

export interface StatusReportInput {
  docCount: number;
  scannedCount: number;
  quotaUsed: number;
  quotaMax: number;
  reserve: number;
  lock: LockState | null;
  /**
   * Identity of the active embedding provider (`embedder.identity.providerId`).
   * The daily quota is specific to Gemini: for any other embedder
   * (in-process, OpenAI-compatible endpoint…) we don't show a Gemini quota.
   * Absent → treated as Gemini (backward-compat).
   */
  providerId?: string;
  /** State of the last catch-up run (or the in-progress one), if any. */
  progress?: RunProgress | null;
  /** Current ISO instant (required for the ETA of a `running` run). */
  now?: string;
}

/** Builds a natural-language status report of the RAG (pure function, no I/O). */
export function buildStatusReport(input: StatusReportInput): string {
  const lines = [indexLine(input), embeddingLine(input)];
  const lock = lockLine(input);
  if (lock) lines.push(lock);
  const progress = progressLine(input);
  if (progress) lines.push(progress);
  return lines.join("\n");
}

function progressLine(input: StatusReportInput): string | null {
  if (!input.progress) return null;
  return formatProgressReport(input.progress, input.now ?? input.progress.startedAt);
}

/**
 * Reusable incompleteness warning (startup, degradation): a resume message if
 * docs remain to be indexed, `null` if the index is complete (nothing to
 * surface). Single source of the "index incomplete" phrasing.
 */
export function incompleteIndexWarning(input: {
  docCount: number;
  scannedCount: number;
}): string | null {
  const remaining = input.scannedCount - input.docCount;
  if (remaining <= 0) return null;
  return `Index incomplete: ${input.docCount}/${input.scannedCount} files indexed, ${remaining} pending — ${RESUME_HINT}.`;
}

function indexLine(input: StatusReportInput): string {
  return (
    incompleteIndexWarning(input) ??
    `Index up to date: ${input.docCount}/${input.scannedCount} files indexed.`
  );
}

/**
 * Embedding line: the daily quota is specific to Gemini (free tier cap). For a
 * local/alternative embedder, showing that quota would be misleading — we emit
 * an honest line instead. Provider absent → Gemini (backward-compat).
 */
function embeddingLine(input: StatusReportInput): string {
  const providerId = input.providerId;
  // Provider absent → Gemini (backward-compat). Only Gemini has the daily quota.
  if (providerId === undefined || providerId === "gemini") return quotaLine(input);
  return localEmbeddingLine(providerId);
}

function localEmbeddingLine(providerId: string): string {
  // In-process "Gemma inside": truly local → we can promise offline.
  if (providerId === "transformers-js") {
    return "Local embeddings (in-process): unlimited, offline — no API quota.";
  }
  // OpenAI-compatible endpoint (local Ollama OR remote service): no Gemini
  // quota, but we don't promise offline (it may be a network endpoint).
  if (providerId === "openai-compatible") {
    return "Embeddings via OpenAI-compatible endpoint: no Gemini quota tracked.";
  }
  return `Embeddings via ${providerId}: no Gemini quota tracked.`;
}

function quotaLine(input: StatusReportInput): string {
  const remaining = input.quotaMax - input.quotaUsed;
  return `Quota: ${input.quotaUsed}/${input.quotaMax} used today, ${remaining} remaining (reserve ${input.reserve} for search).`;
}

function lockLine(input: StatusReportInput): string | null {
  if (!input.lock) return null;
  return `Reindex in progress (PID ${input.lock.pid}).`;
}
