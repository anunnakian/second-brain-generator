// ═══════════════════════════════════════════════════════════════════════════
// native-deps.ts — self-heal for the only ABI-bound dep, better-sqlite3.
//
// On a multi-Node machine the binary can be moulded for one Node (at install)
// then loaded by another (the launcher's self-heal PATH may resolve a different
// Node) → an ABI mismatch at load time. `isNativeAbiError` recognises that
// failure family so the loader can rebuild the binding under the CURRENT Node
// and retry once (deterministic self-heal, ADR 0009).
// ═══════════════════════════════════════════════════════════════════════════

// True when `err` is a native-binding load failure a rebuild can cure: a Node-ABI
// mismatch (wrong NODE_MODULE_VERSION), a CPU-arch skew (x86_64 vs arm64), a failed
// NAPI self-registration, OR a missing/unbuilt binding. NOT any other failure
// (SQLITE_CORRUPT, ENOENT… → must never trigger a blind rebuild).
const BINDING_FAILURE_SIGNS = [
  "NODE_MODULE_VERSION", // compiled against a different Node.js version
  "Could not locate the bindings file", // binary absent / never built
  "incompatible architecture", // macOS dlopen: x86_64 vs arm64 skew
  "did not self-register", // binding loaded but NAPI registration failed (stale ABI)
];

export function isNativeAbiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return BINDING_FAILURE_SIGNS.some((sign) => msg.includes(sign));
}

// The invocation that rebuilds better-sqlite3 under the CURRENT Node, as
// {command, args} for child_process (run it with cwd = rag/). On Windows `npm`
// is `npm.cmd`, and spawning a .cmd directly (without a shell) throws EINVAL
// since Node's April-2024 spawn hardening — so route it through `cmd /c`, never
// spawn `npm.cmd` as the executable. Mirrors buildRagInstallInvocation.
export function buildRebuildInvocation(platform: NodeJS.Platform): {
  command: string;
  args: string[];
} {
  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "npm", "rebuild", "better-sqlite3"] };
  }
  return { command: "npm", args: ["rebuild", "better-sqlite3"] };
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
