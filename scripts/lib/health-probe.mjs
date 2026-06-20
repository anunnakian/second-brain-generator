// ─────────────────────────────────────────────────────────────────────────────
// health-probe.mjs — the pure probe registry for the SessionStart health-check
// (ADR 0028, F7). Runs deterministic functional probes over the engine's real
// capabilities and returns a verdict array [{ capability, status, detail }] where
// status ∈ "ok" | "broken" | "unknown".
//
// Pure & injectable (no fs / no search / no MCP handshake here) so the registry is
// trivially testable: the wrapper feeds it the REAL seams (a live canary search,
// the vector store, the MCP ping). Every probe FAILS OPEN to "unknown" — a probe
// must never throw out of runHealthProbes, and "unknown" never cries wolf.
// ─────────────────────────────────────────────────────────────────────────────

const CANARY_TOKEN = "Mollecuisse";

// Wrap a probe so any thrown error becomes a fail-open "unknown" verdict instead of
// propagating out of runHealthProbes (ADR 0028: the hook must always exit 0).
function failOpen(capability, probe) {
  try {
    return probe();
  } catch (err) {
    return { capability, status: "unknown", detail: `probe error: ${err.message}` };
  }
}

function probeRag({ searchVault }) {
  const results = searchVault(CANARY_TOKEN);
  return results.length > 0
    ? { capability: "rag", status: "ok", detail: `canary found (${results.length})` }
    : { capability: "rag", status: "broken", detail: "canary not found in the vault" };
}

function probeIndex({ indexRowCount }) {
  const rows = indexRowCount();
  return rows > 0
    ? { capability: "index", status: "ok", detail: `${rows} rows` }
    : { capability: "index", status: "broken", detail: "index empty or unreadable" };
}

function probeEmbedder({ embedderMode, weightsPresent, keyConfigured }) {
  if (embedderMode === "in-process") {
    return weightsPresent()
      ? { capability: "embedder", status: "ok", detail: "in-process weights present" }
      : { capability: "embedder", status: "broken", detail: "in-process weights missing" };
  }
  return keyConfigured()
    ? { capability: "embedder", status: "ok", detail: `${embedderMode} key configured` }
    : { capability: "embedder", status: "unknown", detail: `${embedderMode} key not configured` };
}

function probeMcp({ engineServers, pingServer }) {
  const dead = engineServers.filter((id) => !pingServer(id));
  return dead.length === 0
    ? { capability: "mcp", status: "ok", detail: `${engineServers.length} servers reachable` }
    : { capability: "mcp", status: "broken", detail: `unreachable: ${dead.join(", ")}` };
}

// Map a broken check to the RIGHT gesture (ADR 0030 F7-ter, baby-step 5): name the
// cause + the single corrective action, never a generic "restart + /update-engine"
// catch-all (update-engine only matters when the engine CODE is broken, which these
// functional checks don't diagnose).
function gestureForCheck(name, detail = "") {
  switch (name) {
    case "index":
    case "canary":
      return "ask me to reindex your vault";
    case "embedder":
      // In-process: the model weights re-download on first use; API: it's network/key.
      return /weights/i.test(detail)
        ? "ask me to reindex your vault — the local model re-downloads on first use"
        : "check your network and the API key in your .env";
    case "store":
      return "check the mirror's path, or refresh it";
    default:
      return "restart the brain";
  }
}

// Optional engine modules: a break here means "one mirrored source is behind", NOT
// "the brain is broken" — it gets the soft ℹ️ section, never the core ⚠️ alarm. The
// mandatory core (vault-rag) is everything not listed here.
const OPTIONAL_MODULES = new Set(["local-mirror"]);

// Render the broken checks of one module as actionable bullet lines (cause → gesture);
// a module with no structured checks (legacy cache) falls back to a restart hint.
function bulletsFor(mod) {
  const failing = (mod.checks ?? []).filter((c) => c.status !== "ok");
  if (failing.length === 0) return [`   • ${mod.capability} (${mod.detail ?? mod.status}) → restart the brain.`];
  return failing.map((c) => `   • ${c.detail} → ${gestureForCheck(c.name, c.detail)}.`);
}

// The cached-health reader's pure formatter (ADR 0028 §1, ADR 0030 F7-ter): quiet when
// healthy (all ok / only unknown → null — never cry wolf), and otherwise a banner that
// names each broken capability's specific cause + corrective gesture, weighted by
// severity — the mandatory core (vault-rag) gets a loud ⚠️ section, an optional mirror
// a soft ℹ️ "a source is behind" note (the brain still answers). Operates on a verdict
// array (live or read from cache); each entry may carry structured `checks` (the
// F7-bis/ter per-module shape) or just a flat `detail` (legacy cache → restart hint).
export function formatHealthBanner(verdict) {
  const broken = verdict.filter((p) => p.status === "broken");
  if (broken.length === 0) return null;

  const coreBroken = broken.filter((m) => !OPTIONAL_MODULES.has(m.capability));
  const optionalBroken = broken.filter((m) => OPTIONAL_MODULES.has(m.capability));

  const sections = [];
  if (coreBroken.length > 0) {
    sections.push(
      [
        "⚠️ Last health-check found a problem with your brain:",
        ...coreBroken.flatMap(bulletsFor),
        "   Your notes themselves are untouched.",
      ].join("\n"),
    );
  }
  if (optionalBroken.length > 0) {
    sections.push(
      [
        "ℹ️ A mirrored source is behind (your brain still answers):",
        ...optionalBroken.flatMap(bulletsFor),
      ].join("\n"),
    );
  }
  return sections.join("\n");
}

export function runHealthProbes({ manifest, seams }) {
  const engineServers = manifest.engineMcpServers ?? [];
  return [
    failOpen("rag", () => probeRag(seams)),
    failOpen("index", () => probeIndex(seams)),
    failOpen("embedder", () => probeEmbedder(seams)),
    failOpen("mcp", () => probeMcp({ engineServers, pingServer: seams.pingServer })),
  ];
}
