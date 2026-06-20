// ─────────────────────────────────────────────────────────────────────────────
// health-check-gate.mjs — the LOUD-GATE policy shared by verify-rag.mjs + the
// installer post-flight (ADR 0030, F7-bis). The runtime SessionStart probe has a
// DIFFERENT reaction (notify on newly-broken), so it does NOT use this.
//
// Over runActivatedHealthChecks's per-module verdicts, it returns the modules that
// must block the gate (caller → exit 1, named). Policy: block on any `broken`, and
// on a MANDATORY module that is `unknown` (we can't PROVE the mandatory capability
// works). An OPTIONAL module that's `unknown` (e.g. an unconfigured local-mirror on
// a fresh install) is benign → never blocks (no cry-wolf, no false install failure).
// ─────────────────────────────────────────────────────────────────────────────

export function gateBlockers(result, manifest) {
  const requirements = manifest.engineModuleRequirements ?? {};
  return result.modules.filter(
    (m) =>
      m.status === "broken" ||
      (m.status === "unknown" && requirements[m.module] === "mandatory"),
  );
}
