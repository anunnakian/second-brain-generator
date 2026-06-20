// ─────────────────────────────────────────────────────────────────────────────
// self-heal-detect.mjs — the pure gate for the SessionStart self-heal (ADR 0026,
// Layer B). Decides whether a brain still has a convergence GAP: an engine-declared
// skill not yet installed, or an engine MCP server not yet registered in .mcp.json.
//
// Pure & injectable (no fs / no JSON parsing here) so the gate is trivially
// testable: the wrapper feeds it real `skillDirExists` / `mcpServerRegistered`
// predicates. When it returns `needed === false`, the SessionStart hook is a TRUE
// no-op (it spawns nothing) → fast + idempotent in the steady state.
// ─────────────────────────────────────────────────────────────────────────────

// "<…>/local-mirror/**" → "<…>/local-mirror" (mirror reconcile-brain's skill-dir derivation).
function skillGlobToDir(glob) {
  return glob.replace(/\/\*\*?$/, "");
}

export function detectSelfHealGap({ manifest, skillDirExists, mcpServerRegistered }) {
  const missingSkills = (manifest.installSkills ?? [])
    .map(skillGlobToDir)
    .filter((dir) => !skillDirExists(dir));
  const missingServers = (manifest.engineMcpServers ?? []).filter((id) => !mcpServerRegistered(id));
  return {
    needed: missingSkills.length > 0 || missingServers.length > 0,
    missingSkills,
    missingServers,
  };
}
