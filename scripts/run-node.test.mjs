import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildNodeRunnerSh } from "./lib/rag-launcher.mjs";

// Test comportemental : le lanceur généré doit RÉELLEMENT exécuter node et lui
// relayer les arguments du hook. Garde-fou contre un wrapper cassé (le plus grave
// serait un échec silencieux — d'où ce test qui exige une exécution observable).
// POSIX uniquement (run-node.sh) ; sauté sur Windows (couvert par run-node.cmd).
test(
  "run-node.sh : exécute node et relaie les arguments (pas d'échec muet)",
  { skip: process.platform === "win32" ? "POSIX seulement" : false },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "run-node-"));
    try {
      const script = join(dir, "run-node.sh");
      writeFileSync(script, buildNodeRunnerSh());
      const out = execFileSync(
        "/bin/sh",
        [script, "-e", "process.stdout.write('NODE_RAN:'+process.argv.length)"],
        { encoding: "utf8" },
      );
      assert.match(out, /NODE_RAN:/); // node a bien tourné via le wrapper
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
