// ═══════════════════════════════════════════════════════════════════════════
// native-deps.ts — self-heal for the only ABI-bound dep, better-sqlite3.
//
// On a multi-Node machine the binary can be moulded for one Node (at install)
// then loaded by another (the launcher's self-heal PATH may resolve a different
// Node) → an ABI mismatch at load time. `isNativeAbiError` recognises that
// failure family so the loader can rebuild the binding under the CURRENT Node
// and retry once (deterministic self-heal, ADR 0009).
// ═══════════════════════════════════════════════════════════════════════════

// True when `err` is a native-binding load failure a rebuild can cure: an ABI
// mismatch (wrong Node version) OR a missing/unbuilt binding. NOT any other
// failure (which must never trigger a blind rebuild).
const BINDING_FAILURE_SIGNS = [
  "NODE_MODULE_VERSION", // compiled against a different Node.js version
  "Could not locate the bindings file", // binary absent / never built
];

export function isNativeAbiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return BINDING_FAILURE_SIGNS.some((sign) => msg.includes(sign));
}

// Loads a native module, self-healing a binding-ABI failure exactly once: on
// such an error, `rebuild()` (rebuild the binding under the CURRENT Node) then
// retry `load()`. Any other error propagates untouched (no blind rebuild). At
// most one rebuild → a still-broken binding fails loud, never loops.
export function loadNativeWithRebuild<T>(load: () => T, rebuild: () => void): T {
  try {
    return load();
  } catch (err) {
    if (!isNativeAbiError(err)) throw err;
    rebuild();
    return load();
  }
}
