// ═══════════════════════════════════════════════════════════════════════════
// health-check.ts — the PURE aggregator behind vault-rag's standard `health_check`
// MCP tool (ADR 0030, F7-bis). It maps the engine's raw functional vitals onto the
// standard contract { status, checks[] } where status ∈ "ok" | "broken" | "unknown".
//
// "broken" = the engine demonstrably does not work (empty index, canary not found).
// "unknown" = we could not determine (embedder couldn't run, index unreadable,
// missing API key) → never cries wolf, mirroring ADR 0028's no-false-alarm rule.
// Pure & deterministic (ADR 0009): the I/O lives in the gather seam, not here.
// ═══════════════════════════════════════════════════════════════════════════

export type HealthStatus = "ok" | "broken" | "unknown";

export interface HealthCheckEntry {
  name: string;
  status: HealthStatus;
  detail: string;
}

export interface HealthCheckResult {
  status: HealthStatus;
  checks: HealthCheckEntry[];
}

export interface HealthVitals {
  embedderMode: string;
  keyConfigured: boolean;
  embedderReady: boolean;
  indexRows: number;
  canaryHits: number;
}

// The dedicated canary token. Baby-step 3 (ADR 0030 §2) moves this onto a dedicated
// engine-owned health-check note so it survives a demo-note purge; until then the
// probe still targets the seeded demo content.
export const CANARY_TOKEN = "Mollecuisse";

export interface VitalsSeams {
  embedderMode: string;
  keyConfigured: boolean;
  readIndexRows: () => number;
  searchCanary: (token: string) => Promise<number>;
}

// Collects the engine's raw functional vitals through injected seams (the real I/O
// — embedder, vector store — lives in the caller). Every seam fails safe: an index
// read that throws becomes the -1 "unreadable" sentinel; a canary search that throws
// means the embedder could not run (embedderReady false), never a thrown probe.
export async function gatherVitals(seams: VitalsSeams): Promise<HealthVitals> {
  let indexRows = -1;
  try {
    indexRows = seams.readIndexRows();
  } catch {
    indexRows = -1;
  }

  let embedderReady = false;
  let canaryHits = 0;
  try {
    canaryHits = await seams.searchCanary(CANARY_TOKEN);
    embedderReady = true;
  } catch {
    embedderReady = false;
    canaryHits = 0;
  }

  return {
    embedderMode: seams.embedderMode,
    keyConfigured: seams.keyConfigured,
    embedderReady,
    indexRows,
    canaryHits,
  };
}

function aggregate(checks: HealthCheckEntry[]): HealthStatus {
  if (checks.some((c) => c.status === "broken")) return "broken";
  if (checks.some((c) => c.status === "unknown")) return "unknown";
  return "ok";
}

// The single entry the MCP `health_check` tool calls: gather the vitals through the
// real seams, then map them onto the standard { status, checks[] } contract.
export async function runHealthCheck(seams: VitalsSeams): Promise<HealthCheckResult> {
  return buildHealthCheck(await gatherVitals(seams));
}

export function buildHealthCheck(v: HealthVitals): HealthCheckResult {
  const checks: HealthCheckEntry[] = [
    {
      name: "canary",
      // The search only proves anything if the embedder actually ran. If it could
      // not, we cannot conclude the RAG is broken → "unknown", never a false alarm.
      status: !v.embedderReady ? "unknown" : v.canaryHits > 0 ? "ok" : "broken",
      detail: !v.embedderReady
        ? "embedder could not run the canary search"
        : v.canaryHits > 0
          ? `canary found (${v.canaryHits})`
          : "canary not found in the vault",
    },
    {
      name: "index",
      // A negative row count is the "could not read the store at all" sentinel →
      // unknown; a genuine 0 means an empty index → broken.
      status: v.indexRows < 0 ? "unknown" : v.indexRows > 0 ? "ok" : "broken",
      detail:
        v.indexRows < 0
          ? "index could not be read"
          : v.indexRows > 0
            ? `${v.indexRows} rows`
            : "index empty",
    },
    {
      name: "embedder",
      // A missing API key is the separately-handled state, not a break: report it
      // "unknown" so we never cry wolf when the user simply hasn't set a key yet.
      status: !v.keyConfigured ? "unknown" : v.embedderReady ? "ok" : "broken",
      detail: !v.keyConfigured
        ? `${v.embedderMode} key not configured`
        : v.embedderReady
          ? `${v.embedderMode} ready`
          : `${v.embedderMode} could not run`,
    },
  ];
  return { status: aggregate(checks), checks };
}
