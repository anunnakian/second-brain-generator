import { test } from "node:test";
import assert from "node:assert/strict";

import { addServerToMcpJson, addPermissions } from "./connectors-merge.mjs";

const driveConnector = {
  id: "google-drive",
  label: "Google Drive (community)",
  kind: "mcp",
  serverConfig: {
    type: "stdio",
    command: "npx",
    args: ["-y", "@some/google-drive-mcp"],
    env: { GDRIVE_CREDS: "<CHEMIN_CREDENTIALS>" },
  },
  permissions: ["mcp__google-drive__search", "mcp__google-drive__read"],
  credentialsHint: "Place an OAuth credentials file, see SETUP §6.",
};

test("addServerToMcpJson adds the server under its id", () => {
  const mcp = { mcpServers: { "vault-rag": { command: "npx" } } };

  const result = addServerToMcpJson(mcp, driveConnector);

  assert.deepEqual(result.mcpServers["google-drive"], driveConnector.serverConfig);
});

test("addServerToMcpJson does not mutate the input and keeps existing servers", () => {
  const mcp = { mcpServers: { "vault-rag": { command: "npx" } } };

  const result = addServerToMcpJson(mcp, driveConnector);

  // input untouched
  assert.deepEqual(mcp, { mcpServers: { "vault-rag": { command: "npx" } } });
  assert.notEqual(result, mcp);
  // pre-existing server kept
  assert.deepEqual(result.mcpServers["vault-rag"], { command: "npx" });
});

test("addServerToMcpJson is idempotent: re-adding does not create a duplicate", () => {
  const mcp = { mcpServers: { "vault-rag": { command: "npx" } } };

  const once = addServerToMcpJson(mcp, driveConnector);
  const twice = addServerToMcpJson(once, driveConnector);

  assert.deepEqual(twice, once);
  assert.equal(Object.keys(twice.mcpServers).length, 2);
});

test("addPermissions adds the new permissions to permissions.allow", () => {
  const settings = { permissions: { allow: ["Read", "Write"], deny: [] } };

  const result = addPermissions(settings, ["mcp__google-drive__search"]);

  assert.deepEqual(result.permissions.allow, [
    "Read",
    "Write",
    "mcp__google-drive__search",
  ]);
});

test("addPermissions does not duplicate a permission already present", () => {
  const settings = {
    permissions: { allow: ["Read", "mcp__google-drive__search"], deny: [] },
  };

  const result = addPermissions(settings, [
    "mcp__google-drive__search", // already there
    "mcp__google-drive__read", // new
  ]);

  assert.deepEqual(result.permissions.allow, [
    "Read",
    "mcp__google-drive__search",
    "mcp__google-drive__read",
  ]);
});

test("addPermissions does not mutate the input", () => {
  const settings = { permissions: { allow: ["Read"], deny: [] } };

  const result = addPermissions(settings, ["mcp__google-drive__search"]);

  assert.deepEqual(settings.permissions.allow, ["Read"]); // untouched
  assert.notEqual(result, settings);
  assert.notEqual(result.permissions.allow, settings.permissions.allow);
});
