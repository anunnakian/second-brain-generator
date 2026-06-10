import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildShLauncher,
  buildCmdLauncher,
  pathPrependSh,
  pathPrependCmd,
  minimalPathEnv,
  applyRagLauncher,
  buildNodeRunnerSh,
  buildNodeRunnerCmd,
  nodeHookCommand,
} from "./rag-launcher.mjs";

// Reproduces installer.mjs's (gen) text substitution: .split().join() per key.
function substitute(tpl, reps) {
  let out = tpl;
  for (const [k, v] of Object.entries(reps)) out = out.split(k).join(v);
  return out;
}

test("buildShLauncher: sh shebang + starts the RAG server via npx tsx", () => {
  const sh = buildShLauncher();
  assert.match(sh, /^#!\/bin\/sh/);
  assert.match(sh, /exec npx tsx rag\/src\/index\.ts/);
});

test("buildShLauncher: self-heal of node locations invisible in GUI (homebrew, nvm)", () => {
  const sh = buildShLauncher();
  assert.match(sh, /\/opt\/homebrew\/bin/); // Homebrew Apple Silicon (the case that breaks)
  assert.match(sh, /\.nvm\/versions\/node\/\*\/bin/); // nvm (glob resolved by sh at runtime)
  assert.match(sh, /\[ -d "\$1" \]/); // only prepends directories that exist (portable)
});

test("pathPrependSh: broadened coverage (usr/bin Linux, volta, nodenv, fnm Linux+macOS)", () => {
  const sh = pathPrependSh();
  assert.match(sh, /add \/usr\/bin/); // node via Linux system manager (apt/dnf/nodesource)
  assert.match(sh, /\$HOME\/\.volta\/bin/); // Volta
  assert.match(sh, /\$HOME\/\.nodenv\/shims/); // nodenv
  assert.match(sh, /\.local\/share\/fnm\/.*installation\/bin/); // fnm Linux (glob resolved by sh)
  // fnm macOS: "Application Support" directory (space) → must be quoted correctly in sh
  assert.match(sh, /"\$HOME\/Library\/Application Support\/fnm"\/.*installation\/bin/);
});

test("pathPrependCmd: Volta Windows coverage (%LOCALAPPDATA%\\Volta\\bin)", () => {
  const cmd = pathPrependCmd();
  assert.match(cmd, /%LOCALAPPDATA%\\Volta\\bin/); // Volta on Windows
});

test("buildCmdLauncher: @echo off + Windows self-heal + starts the RAG server", () => {
  const cmd = buildCmdLauncher();
  assert.match(cmd, /@echo off/);
  assert.match(cmd, /%ProgramFiles%\\nodejs/); // official Windows installer
  assert.match(cmd, /npx tsx rag\/src\/index\.ts/);
});

test("buildNodeRunnerSh: PATH self-heal then exec node on the hook's arguments", () => {
  const sh = buildNodeRunnerSh();
  assert.match(sh, /^#!\/bin\/sh/);
  assert.match(sh, /\/opt\/homebrew\/bin/); // same self-heal as the RAG (Homebrew Apple Silicon)
  assert.match(sh, /\.nvm\/versions\/node\/\*\/bin/); // nvm (Achille's Mac case)
  assert.match(sh, /exec node "\$@"/); // relays node + all the hook's args
});

test("buildNodeRunnerCmd: @echo off + Windows self-heal then node on the arguments", () => {
  const cmd = buildNodeRunnerCmd();
  assert.match(cmd, /@echo off/);
  assert.match(cmd, /%ProgramFiles%\\nodejs/); // same Windows self-heal as the RAG
  assert.match(cmd, /node %\*/); // relays node + all the hook's args
});

test("nodeHookCommand posix: substituted in the JSON template → command parseable via run-node.sh", () => {
  // Mirror of .claude/settings.json.template (statusLine): {{NODE}} followed by the
  // .mjs script path, all inside a JSON string (escaped quotes).
  const tpl = '{ "command": "{{NODE}} \\"{{PROJECT_ROOT}}/scripts/status-line.mjs\\"" }';
  const out = substitute(tpl, {
    "{{NODE}}": nodeHookCommand("darwin", "/Users/x/brain"),
    "{{PROJECT_ROOT}}": "/Users/x/brain",
  });
  const parsed = JSON.parse(out); // must stay valid JSON
  assert.equal(
    parsed.command,
    '/bin/sh "/Users/x/brain/scripts/run-node.sh" "/Users/x/brain/scripts/status-line.mjs"',
  );
});

test("nodeHookCommand win32: substituted → valid JSON, backslash paths to run-node.cmd", () => {
  const tpl = '{ "command": "{{NODE}} \\"{{PROJECT_ROOT}}/scripts/auto-commit.mjs\\"" }';
  const out = substitute(tpl, {
    "{{NODE}}": nodeHookCommand("win32", "C:/Users/x/brain"),
    "{{PROJECT_ROOT}}": "C:/Users/x/brain",
  });
  const parsed = JSON.parse(out);
  assert.match(parsed.command, /^cmd \/c "C:\\Users\\x\\brain\\scripts\\run-node\.cmd"/);
});

test("minimalPathEnv posix: neutralizes PATH, preserves the rest of the env", () => {
  const env = minimalPathEnv("darwin", { HOME: "/h", PATH: "/usr/local/bin:/x" });
  assert.equal(env.PATH, ""); // sh launched by absolute path → node will come ONLY from the self-heal
  assert.equal(env.HOME, "/h"); // preserved: the self-heal needs it
});

test("minimalPathEnv win32: PATH reduced to System32 (cmd.exe findable), rest preserved", () => {
  const env = minimalPathEnv("win32", {
    SystemRoot: "C:\\Windows",
    ProgramFiles: "C:\\PF",
    PATH: "C:\\Windows\\System32;C:\\node;C:\\autre",
  });
  assert.match(env.PATH, /System32$/); // cmd.exe must stay resolvable; node will come from the self-heal
  assert.equal(env.ProgramFiles, "C:\\PF"); // preserved
});

test("minimalPathEnv win32: SystemRoot missing → fallback C:\\Windows", () => {
  const env = minimalPathEnv("win32", { PATH: "x" });
  assert.equal(env.PATH, "C:\\Windows\\System32");
});

test("applyRagLauncher: rewrites the vault-rag command per OS, preserves cwd/env", () => {
  const base = {
    mcpServers: {
      "vault-rag": { type: "stdio", command: "npx", args: ["tsx", "rag/src/index.ts"], cwd: "/brain", env: {} },
    },
  };

  const mac = applyRagLauncher(structuredClone(base), "darwin");
  assert.equal(mac.mcpServers["vault-rag"].command, "/bin/sh");
  assert.deepEqual(mac.mcpServers["vault-rag"].args, ["rag/launch.sh"]);
  assert.equal(mac.mcpServers["vault-rag"].cwd, "/brain"); // preserved

  const win = applyRagLauncher(structuredClone(base), "win32");
  assert.equal(win.mcpServers["vault-rag"].command, "cmd");
  assert.deepEqual(win.mcpServers["vault-rag"].args, ["/c", "rag\\launch.cmd"]);
});
