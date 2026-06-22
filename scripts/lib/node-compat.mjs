// ═══════════════════════════════════════════════════════════════════════════
// node-compat.mjs — PURE preflight: is the running Node inside the engine's
// supported window? No I/O. Fail-loud BEFORE `npm install` (ADR 0009).
//
// The only ABI-bound surface is native modules (better-sqlite3 — onnxruntime
// ships broad prebuilds). A version below the floor fails to build the binding
// cryptically; we catch it here with an actionable message instead.
// ═══════════════════════════════════════════════════════════════════════════

// The supported Node window for the engine's native deps. Floor raised to 22:
// Node 20 is EOL (April 2026) and better-sqlite3 ≥ 12.10 stopped publishing a
// Node-20 (ABI 115) prebuild; ceiling = highest declared major (26.x). MUST stay
// in sync with `rag/package.json` "engines.node" and the CI matrix (ADR 0020).
export const NODE_WINDOW = { min: 22, max: 26 };

export function checkNode(version, window) {
  const major = Number(String(version).split(".")[0]);
  if (major < window.min) {
    return {
      ok: false,
      message:
        `Node ${version} detected — this engine's native deps need Node ≥ ${window.min}. ` +
        `Node 20 is EOL (April 2026) and has no prebuilt binary for better-sqlite3. ` +
        `Install Node ${window.min}+ via nvm/volta (or from https://nodejs.org) then re-run.`,
    };
  }
  if (major > window.max) {
    return {
      ok: true,
      warn: true,
      message:
        `Node ${version} detected — newer than the tested ceiling (Node ${window.max}). ` +
        `Proceeding; if the native build fails, fall back to Node ${window.max}.`,
    };
  }
  return { ok: true };
}
