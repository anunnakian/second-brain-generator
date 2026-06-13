// ═══════════════════════════════════════════════════════════════════════════
// open-env.mjs — best-effort, cross-platform opener for the brain's `.env`.
// Used on the Gemini-key install path (CASE B) to pop the user's editor on the
// `.env` so they can paste GOOGLE_GEMINI_API_KEY without hunting for a hidden
// file. Pure/seam-injectable: no implicit I/O, spawn is injected.
// ═══════════════════════════════════════════════════════════════════════════

// Maps a platform + ABSOLUTE path to the editor-open command, or null if the
// platform is unknown. Always an absolute path (never a quoted `~`, which the
// shell would not expand).
export function buildOpenEnvCommand(platform, absPath) {
  if (platform === "darwin") return { command: "open", args: ["-t", absPath] };
  if (platform === "win32") return { command: "notepad", args: [absPath] };
  if (platform === "linux") return { command: "xdg-open", args: [absPath] };
  return null;
}

// Guard: should we even attempt to pop an editor? false in automated/headless
// contexts where a window would spam (tests/CI) or hang (headless Linux).
export function shouldOpenEnv(env, platform) {
  if (env.SBG_NO_OPEN_ENV) return false;
  if (env.CI) return false;
  if (platform === "linux" && !env.DISPLAY && !env.WAYLAND_DISPLAY) return false;
  return true;
}

// Thin, best-effort wrapper: if the guard allows and we have a command, spawn a
// detached editor on `absPath` and detach. NEVER throws — a failed/absent editor
// must not break the install. Returns { opened: boolean }. `spawn` is injected.
export function openEnvInEditor(absPath, { platform, env, spawn }) {
  if (!shouldOpenEnv(env, platform)) return { opened: false };
  const cmd = buildOpenEnvCommand(platform, absPath);
  if (!cmd) return { opened: false };
  try {
    const child = spawn(cmd.command, cmd.args, { detached: true, stdio: "ignore" });
    child.unref();
    return { opened: true };
  } catch {
    return { opened: false };
  }
}
