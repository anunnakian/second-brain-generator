import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { applyConnectorFiles } from "./connectors-apply.mjs";

const mcpConnector = {
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

// Prepares a throwaway folder with a minimal .mcp.json and settings.json.
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "sbg-connectors-"));
  const mcpPath = join(dir, ".mcp.json");
  const settingsPath = join(dir, "settings.json");
  writeFileSync(mcpPath, JSON.stringify({ mcpServers: { "vault-rag": { command: "npx" } } }, null, 2));
  writeFileSync(settingsPath, JSON.stringify({ permissions: { allow: ["Read"], deny: [] } }, null, 2));
  return { mcpPath, settingsPath };
}

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

test("applyConnectorFiles writes the server and the permissions into the files", () => {
  const { mcpPath, settingsPath } = scratch();

  const res = applyConnectorFiles(mcpConnector, { mcpPath, settingsPath });

  assert.equal(res.wrote, true);
  assert.deepEqual(readJson(mcpPath).mcpServers["google-drive"], mcpConnector.serverConfig);
  assert.deepEqual(readJson(settingsPath).permissions.allow, [
    "Read",
    "mcp__google-drive__search",
    "mcp__google-drive__read",
  ]);
});

test("applyConnectorFiles is idempotent: a 2nd pass duplicates nothing", () => {
  const { mcpPath, settingsPath } = scratch();

  applyConnectorFiles(mcpConnector, { mcpPath, settingsPath });
  applyConnectorFiles(mcpConnector, { mcpPath, settingsPath });

  assert.equal(Object.keys(readJson(mcpPath).mcpServers).length, 2); // vault-rag + google-drive
  assert.deepEqual(readJson(settingsPath).permissions.allow, [
    "Read",
    "mcp__google-drive__search",
    "mcp__google-drive__read",
  ]);
});

test("applyConnectorFiles writes nothing for a native connector", () => {
  const { mcpPath, settingsPath } = scratch();

  const res = applyConnectorFiles(
    { id: "slack", kind: "native", credentialsHint: "via claude.ai" },
    { mcpPath, settingsPath },
  );

  assert.equal(res.wrote, false);
  assert.deepEqual(Object.keys(readJson(mcpPath).mcpServers), ["vault-rag"]);
  assert.deepEqual(readJson(settingsPath).permissions.allow, ["Read"]);
});
