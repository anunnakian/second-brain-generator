#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// health-probe-run.mjs — the DETACHED probe child (ADR 0028 + 0030, F7/F7-bis).
// Spawned by session-health.mjs at SessionStart, it asks every ACTIVATED engine
// module its standard MCP `health_check` (the SAME runner the installer post-flight
// and verify-rag use — "one definition of operational, three reactions"), persists
// the fresh verdict to engine-health.json, and OS-notifies the moment a capability
// becomes NEWLY broken. Runs in the background → session start never waits.
//
// This is a real `health_check` round-trip per module (revises the F7 baby-step-4b
// presence-only choice: presence ≠ function — a registered-but-dead server, or a
// RAG that answers nothing, is now caught, not just a vanished launch entry).
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runActivatedHealthChecks } from "./lib/health-check-runner.mjs";
import { buildHealthCheckCaller } from "./lib/health-check-wiring.mjs";

export async function runProbeChild({ runProbes, readPriorVerdict, writeVerdict, notify }) {
  const verdict = await runProbes();
  // Notify ONLY on a NEWLY broken capability (broken now AND not broken before) so a
  // still-broken capability never re-nags every session; a fresh break is loud once.
  const wasBroken = new Set(
    (readPriorVerdict() ?? []).filter((p) => p.status === "broken").map((p) => p.capability),
  );
  const newlyBroken = verdict.filter((p) => p.status === "broken" && !wasBroken.has(p.capability));
  writeVerdict(verdict);
  for (const probe of newlyBroken) notify(probe);
  return { verdict, newlyBroken };
}

// npx is a shell-wrapped `.cmd` on Windows (unlike a real .exe) → platform switch,
// mirroring engine-seams.mjs's npm handling (ADR 0015).
const npxExe = (platform) => (platform === "win32" ? "npx.cmd" : "npx");

// Map the runner's per-module verdict onto the persisted shape formatHealthBanner +
// session-health.mjs read ({ capability, status, detail }) — kept stable so those two
// stay untouched. `detail` summarises the non-ok checks (or the bare status).
function toBannerVerdict(modules) {
  return modules.map((m) => {
    const bad = (m.checks ?? []).filter((ch) => ch.status !== "ok");
    const detail = bad.length ? bad.map((ch) => `${ch.name}: ${ch.detail}`).join("; ") : m.status;
    return { capability: m.module, status: m.status, detail };
  });
}

// ── main: wire the real I/O seams (deterministic glue, not unit-tested) ───────
// Runs in the DETACHED background child (a real health_check round-trip per module
// loads the embedder + searches → seconds) so session start never waits. Writes
// engine-health.json and OS-notifies only on a newly-broken capability. Fail-open:
// ALWAYS exit 0.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const brainDir = resolve(flag("brainDir") ?? join(__dirname, ".."));
  const platform = flag("platform") ?? process.platform;
  const healthFile = join(brainDir, "engine-health.json");
  const manifest = JSON.parse(readFileSync(join(brainDir, "engine-manifest.json"), "utf8"));
  const mcpServers = JSON.parse(readFileSync(join(brainDir, ".mcp.json"), "utf8")).mcpServers ?? {};

  const { isRegistered, callHealthCheck } = buildHealthCheckCaller({
    mcpServers,
    platform,
    // Mute each module's startup auto-reindex toast (this probe fires its OWN notify,
    // a separate child below, only on a newly-broken capability); generous headroom so
    // a slow in-process ONNX reload is never mistaken for a break (false notify).
    env: { SBG_NO_NOTIFY: "1" },
    timeoutMs: 60000,
  });

  runProbeChild({
    runProbes: async () => {
      const { modules } = await runActivatedHealthChecks({ manifest, isRegistered, callHealthCheck });
      return toBannerVerdict(modules);
    },
    readPriorVerdict: () =>
      existsSync(healthFile) ? JSON.parse(readFileSync(healthFile, "utf8")).verdict ?? null : null,
    writeVerdict: (verdict) => writeFileSync(healthFile, JSON.stringify({ verdict }, null, 2) + "\n"),
    notify: (probe) => {
      const child = spawn(
        npxExe(platform),
        ["tsx", "rag/src/notify-cli.ts", "Second brain — health check", `${probe.capability} is broken: ${probe.detail}`],
        { cwd: brainDir, detached: true, stdio: "ignore", windowsHide: true },
      );
      child.unref();
    },
  })
    .then(() => process.exit(0))
    .catch(() => process.exit(0));
}
