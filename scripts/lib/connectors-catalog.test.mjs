import { test } from "node:test";
import assert from "node:assert/strict";

import { CONNECTORS } from "./connectors-catalog.mjs";

test("le catalogue contient 2 à 4 connecteurs", () => {
  assert.ok(Array.isArray(CONNECTORS));
  assert.ok(CONNECTORS.length >= 2 && CONNECTORS.length <= 4, `len=${CONNECTORS.length}`);
});

test("chaque connecteur a id/label/kind/credentialsHint, ids uniques", () => {
  const ids = new Set();
  for (const c of CONNECTORS) {
    assert.ok(c.id, "id manquant");
    assert.ok(c.label, `label manquant pour ${c.id}`);
    assert.ok(["mcp", "native"].includes(c.kind), `kind invalide pour ${c.id}`);
    assert.ok(c.credentialsHint, `credentialsHint manquant pour ${c.id}`);
    assert.ok(!ids.has(c.id), `id dupliqué : ${c.id}`);
    ids.add(c.id);
  }
});

test("connecteurs mcp : serverConfig + permissions, env en placeholders (pas de vrai secret)", () => {
  const mcp = CONNECTORS.filter((c) => c.kind === "mcp");
  assert.ok(mcp.length >= 1, "au moins un connecteur mcp attendu");
  for (const c of mcp) {
    assert.ok(c.serverConfig, `serverConfig manquant pour ${c.id}`);
    assert.ok(Array.isArray(c.permissions) && c.permissions.length > 0, `permissions manquantes pour ${c.id}`);
    for (const p of c.permissions) {
      assert.match(p, /^mcp__/, `permission non-mcp pour ${c.id} : ${p}`);
    }
    // neutralité : toute valeur d'env est un placeholder <...>, jamais un vrai secret
    for (const v of Object.values(c.serverConfig.env ?? {})) {
      assert.match(v, /^<.+>$/, `env non-placeholder pour ${c.id} : ${v}`);
    }
  }
});

test("connecteurs natifs : aucun serverConfig (rien à écrire dans .mcp.json)", () => {
  for (const c of CONNECTORS.filter((c) => c.kind === "native")) {
    assert.equal(c.serverConfig, undefined, `un natif ne doit pas avoir de serverConfig : ${c.id}`);
  }
});
