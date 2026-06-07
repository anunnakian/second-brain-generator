import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildShLauncher,
  buildCmdLauncher,
  applyRagLauncher,
  buildNodeRunnerSh,
  buildNodeRunnerCmd,
  nodeHookCommand,
} from "./rag-launcher.mjs";

// Reproduit la substitution texte de bootstrap.mjs (gen) : .split().join() par clé.
function substitute(tpl, reps) {
  let out = tpl;
  for (const [k, v] of Object.entries(reps)) out = out.split(k).join(v);
  return out;
}

test("buildShLauncher : shebang sh + lance le serveur RAG via npx tsx", () => {
  const sh = buildShLauncher();
  assert.match(sh, /^#!\/bin\/sh/);
  assert.match(sh, /exec npx tsx rag\/src\/index\.ts/);
});

test("buildShLauncher : self-heal des emplacements node invisibles en GUI (homebrew, nvm)", () => {
  const sh = buildShLauncher();
  assert.match(sh, /\/opt\/homebrew\/bin/); // Homebrew Apple Silicon (le cas qui casse)
  assert.match(sh, /\.nvm\/versions\/node\/\*\/bin/); // nvm (glob résolu par sh au runtime)
  assert.match(sh, /\[ -d "\$1" \]/); // ne prepende que les dossiers existants (portable)
});

test("buildCmdLauncher : @echo off + self-heal Windows + lance le serveur RAG", () => {
  const cmd = buildCmdLauncher();
  assert.match(cmd, /@echo off/);
  assert.match(cmd, /%ProgramFiles%\\nodejs/); // installeur officiel Windows
  assert.match(cmd, /npx tsx rag\/src\/index\.ts/);
});

test("buildNodeRunnerSh : self-heal du PATH puis exec node sur les arguments du hook", () => {
  const sh = buildNodeRunnerSh();
  assert.match(sh, /^#!\/bin\/sh/);
  assert.match(sh, /\/opt\/homebrew\/bin/); // même self-heal que le RAG (Homebrew Apple Silicon)
  assert.match(sh, /\.nvm\/versions\/node\/\*\/bin/); // nvm (le cas du Mac d'Achille)
  assert.match(sh, /exec node "\$@"/); // relaie node + tous les args du hook
});

test("buildNodeRunnerCmd : @echo off + self-heal Windows puis node sur les arguments", () => {
  const cmd = buildNodeRunnerCmd();
  assert.match(cmd, /@echo off/);
  assert.match(cmd, /%ProgramFiles%\\nodejs/); // même self-heal Windows que le RAG
  assert.match(cmd, /node %\*/); // relaie node + tous les args du hook
});

test("nodeHookCommand posix : substitué dans le template JSON → commande parseable via run-node.sh", () => {
  // Template miroir de .claude/settings.json.template (statusLine) : {{NODE}} suivi
  // du chemin du script .mjs, le tout dans une string JSON (guillemets échappés).
  const tpl = '{ "command": "{{NODE}} \\"{{PROJECT_ROOT}}/scripts/status-line.mjs\\"" }';
  const out = substitute(tpl, {
    "{{NODE}}": nodeHookCommand("darwin", "/Users/x/brain"),
    "{{PROJECT_ROOT}}": "/Users/x/brain",
  });
  const parsed = JSON.parse(out); // doit rester du JSON valide
  assert.equal(
    parsed.command,
    '/bin/sh "/Users/x/brain/scripts/run-node.sh" "/Users/x/brain/scripts/status-line.mjs"',
  );
});

test("nodeHookCommand win32 : substitué → JSON valide, chemins backslash vers run-node.cmd", () => {
  const tpl = '{ "command": "{{NODE}} \\"{{PROJECT_ROOT}}/scripts/auto-commit.mjs\\"" }';
  const out = substitute(tpl, {
    "{{NODE}}": nodeHookCommand("win32", "C:/Users/x/brain"),
    "{{PROJECT_ROOT}}": "C:/Users/x/brain",
  });
  const parsed = JSON.parse(out);
  assert.match(parsed.command, /^cmd \/c "C:\\Users\\x\\brain\\scripts\\run-node\.cmd"/);
});

test("applyRagLauncher : réécrit la commande vault-rag selon l'OS, préserve cwd/env", () => {
  const base = {
    mcpServers: {
      "vault-rag": { type: "stdio", command: "npx", args: ["tsx", "rag/src/index.ts"], cwd: "/brain", env: {} },
    },
  };

  const mac = applyRagLauncher(structuredClone(base), "darwin");
  assert.equal(mac.mcpServers["vault-rag"].command, "/bin/sh");
  assert.deepEqual(mac.mcpServers["vault-rag"].args, ["rag/launch.sh"]);
  assert.equal(mac.mcpServers["vault-rag"].cwd, "/brain"); // préservé

  const win = applyRagLauncher(structuredClone(base), "win32");
  assert.equal(win.mcpServers["vault-rag"].command, "cmd");
  assert.deepEqual(win.mcpServers["vault-rag"].args, ["/c", "rag\\launch.cmd"]);
});
