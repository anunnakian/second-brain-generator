// ═══════════════════════════════════════════════════════════════════════════
// installer-args.mjs — PURE parsing of non-interactive install answers.
// No I/O. parseAnswers(argv, env, defaults) → resolved answers.
// ═══════════════════════════════════════════════════════════════════════════
import { join } from "node:path";

// Absolute path of the brain folder to CREATE: under `destParent` if provided,
// otherwise under the user's home. Pure: `home` is injected (testable,
// deterministic) — never a call to os.homedir() here.
export function resolveTargetDir({ name, destParent, home }) {
  return join(destParent ?? home, name);
}

// Flags carrying a value (both `--x=v` AND `--x v` forms).
const VALUE_FLAGS = ["name", "owner", "lang", "dest", "embedder"];
// Boolean flags triggering non-interactive mode (with their aliases).
const NON_INTERACTIVE_FLAGS = ["non-interactive", "yes", "no-input"];

// Decides the installer's run mode from PURE signals (no I/O — `isTTY` is
// injected). Central guardrail: we never INSTALL with defaults without explicit
// consent. Without TTY AND without --non-interactive → "refuse" (don't guess).
// This prevents the phantom install when an agent launches the installer
// (non-TTY stdin) without passing --non-interactive.
export function resolveRunMode({ isTTY, nonInteractive, help }) {
  if (help) return "help";
  if (nonInteractive) return "non-interactive";
  if (isTTY) return "interactive";
  return "refuse";
}

export function parseAnswers(argv, env, defaults) {
  const flags = {};
  let nonInteractive = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    const eq = /^--([^=]+)=(.*)$/.exec(arg);
    if (eq) {
      flags[eq[1]] = eq[2];
      continue;
    }
    const bare = /^--(.+)$/.exec(arg);
    if (!bare) continue;
    if (NON_INTERACTIVE_FLAGS.includes(bare[1])) {
      nonInteractive = true;
    } else if (VALUE_FLAGS.includes(bare[1]) && i + 1 < argv.length) {
      flags[bare[1]] = argv[++i];
    }
  }
  // Precedence flag > env > default, field by field.
  const pick = (flag, envKey, def) => flags[flag] ?? env[envKey] ?? def;
  return {
    projectName: pick("name", "SB_PROJECT_NAME", defaults.projectName),
    ownerName: pick("owner", "SB_OWNER_NAME", defaults.ownerName),
    language: pick("lang", "SB_LANGUAGE", defaults.language),
    destParent: pick("dest", "SB_DEST", defaults.destParent),
    // Embedder choice for non-interactive mode (in-process | gemini | ollama).
    // Absent → the installer applies the adaptive recommendation based on the machine (D1).
    embedder: pick("embedder", "SB_EMBEDDER", defaults.embedder),
    nonInteractive,
    help,
  };
}
