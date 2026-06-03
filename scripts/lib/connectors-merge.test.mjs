import { test } from "node:test";
import assert from "node:assert/strict";

import { addServerToMcpJson, addPermissions } from "./connectors-merge.mjs";

const driveConnector = {
  id: "google-drive",
  label: "Google Drive (communautaire)",
  kind: "mcp",
  serverConfig: {
    type: "stdio",
    command: "npx",
    args: ["-y", "@some/google-drive-mcp"],
    env: { GDRIVE_CREDS: "<CHEMIN_CREDENTIALS>" },
  },
  permissions: ["mcp__google-drive__search", "mcp__google-drive__read"],
  credentialsHint: "Place un fichier de credentials OAuth, voir SETUP §6.",
};

test("addServerToMcpJson ajoute le serveur sous son id", () => {
  const mcp = { mcpServers: { "vault-rag": { command: "npx" } } };

  const result = addServerToMcpJson(mcp, driveConnector);

  assert.deepEqual(result.mcpServers["google-drive"], driveConnector.serverConfig);
});

test("addServerToMcpJson ne mute pas l'entrée et conserve les serveurs existants", () => {
  const mcp = { mcpServers: { "vault-rag": { command: "npx" } } };

  const result = addServerToMcpJson(mcp, driveConnector);

  // entrée intacte
  assert.deepEqual(mcp, { mcpServers: { "vault-rag": { command: "npx" } } });
  assert.notEqual(result, mcp);
  // serveur préexistant conservé
  assert.deepEqual(result.mcpServers["vault-rag"], { command: "npx" });
});

test("addServerToMcpJson est idempotent : ré-ajouter ne crée pas de doublon", () => {
  const mcp = { mcpServers: { "vault-rag": { command: "npx" } } };

  const once = addServerToMcpJson(mcp, driveConnector);
  const twice = addServerToMcpJson(once, driveConnector);

  assert.deepEqual(twice, once);
  assert.equal(Object.keys(twice.mcpServers).length, 2);
});

test("addPermissions ajoute les nouvelles permissions à permissions.allow", () => {
  const settings = { permissions: { allow: ["Read", "Write"], deny: [] } };

  const result = addPermissions(settings, ["mcp__google-drive__search"]);

  assert.deepEqual(result.permissions.allow, [
    "Read",
    "Write",
    "mcp__google-drive__search",
  ]);
});

test("addPermissions ne duplique pas une permission déjà présente", () => {
  const settings = {
    permissions: { allow: ["Read", "mcp__google-drive__search"], deny: [] },
  };

  const result = addPermissions(settings, [
    "mcp__google-drive__search", // déjà là
    "mcp__google-drive__read", // nouvelle
  ]);

  assert.deepEqual(result.permissions.allow, [
    "Read",
    "mcp__google-drive__search",
    "mcp__google-drive__read",
  ]);
});

test("addPermissions ne mute pas l'entrée", () => {
  const settings = { permissions: { allow: ["Read"], deny: [] } };

  const result = addPermissions(settings, ["mcp__google-drive__search"]);

  assert.deepEqual(settings.permissions.allow, ["Read"]); // intact
  assert.notEqual(result, settings);
  assert.notEqual(result.permissions.allow, settings.permissions.allow);
});
