// ─────────────────────────────────────────────────────────────────────────────
// preflight.test.mjs — teste scripts/preflight.sh, le gate node-free d'install.
// On spawn /bin/sh sur le script avec un PATH FABRIQUÉ (dossier temp ne contenant
// que des faux binaires) → on contrôle exactement ce qui est « présent » sans
// dépendre de la machine. Vérifie : exit 0 si tout est là, exit≠0 + message sinon.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const PREFLIGHT = join(dirname(fileURLToPath(import.meta.url)), "preflight.sh");

// Crée un dossier PATH bidon contenant un faux exécutable par nom fourni.
function fakePathWith(tools) {
  const dir = mkdtempSync(join(tmpdir(), "preflight-"));
  mkdirSync(dir, { recursive: true });
  for (const t of tools) {
    const p = join(dir, t);
    writeFileSync(p, "#!/bin/sh\nexit 0\n");
    chmodSync(p, 0o755);
  }
  return dir;
}

// Lance preflight.sh avec PATH = uniquement notre dossier bidon (sh invoqué par
// chemin absolu, donc indépendant de ce PATH).
function runPreflight(toolsPresent) {
  const pathDir = fakePathWith(toolsPresent);
  return spawnSync("/bin/sh", [PREFLIGHT], {
    encoding: "utf8",
    env: { PATH: pathDir },
  });
}

test("preflight — node/npm/npx/git tous présents → exit 0", () => {
  const r = runPreflight(["node", "npm", "npx", "git"]);
  assert.equal(r.status, 0, `attendu exit 0, sortie: ${r.stdout}${r.stderr}`);
});
