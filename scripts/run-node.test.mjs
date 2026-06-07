import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildNodeRunnerSh, minimalPathEnv } from "./lib/rag-launcher.mjs";

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

// Preuve hermétique que la COUVERTURE ÉLARGIE résout réellement node (pas juste que
// la chaîne forwarde). On fabrique un HOME temporaire avec un faux node placé sous
// un dossier de gestionnaire EXCLUSIF à ce HOME (~/.volta/bin) imprimant un marqueur
// unique, puis on lance run-node.sh en PATH APPAUVRI (minimalPathEnv → PATH="").
// Comme `add` prepend, ~/.volta/bin finit en TÊTE du PATH (après les dossiers
// système) → c'est CE node-là qui doit tourner. Si le marqueur s'imprime, la prise
// en charge de Volta est prouvée ; sinon le test échoue (un node système aurait gagné).
// POSIX uniquement (run-node.sh).
test(
  "run-node.sh : la couverture élargie (Volta) résout node depuis un HOME hermétique",
  { skip: process.platform === "win32" ? "POSIX seulement" : false },
  () => {
    const home = mkdtempSync(join(tmpdir(), "run-node-home-"));
    try {
      const voltaBin = join(home, ".volta", "bin");
      mkdirSync(voltaBin, { recursive: true });
      const fakeNode = join(voltaBin, "node");
      writeFileSync(fakeNode, "#!/bin/sh\necho VOLTA_NODE_MARKER\n", { mode: 0o755 });

      const script = join(home, "run-node.sh");
      writeFileSync(script, buildNodeRunnerSh());

      const out = execFileSync("/bin/sh", [script, "-e", "0"], {
        encoding: "utf8",
        env: minimalPathEnv("darwin", { HOME: home }), // PATH="" → node ne peut venir QUE du self-heal
      });
      assert.match(out, /VOLTA_NODE_MARKER/); // c'est bien le node de ~/.volta/bin qui a tourné
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);
