// ─────────────────────────────────────────────────────────────────────────────
// connectors-apply.mjs — wires a connector by merging its config onto disk.
//
// Thin I/O layer on top of the pure merges in connectors-merge.mjs: reads
// .mcp.json + settings.json, applies addServerToMcpJson / addPermissions, then
// rewrites the files. Idempotent (inherited from the merges). Native connectors
// (kind:'native') write NOTHING → { wrote: false }.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from "node:fs";

import { addServerToMcpJson, addPermissions } from "./connectors-merge.mjs";

const writeJson = (path, obj) => writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

export function applyConnectorFiles(connector, { mcpPath, settingsPath }) {
  if (connector.kind !== "mcp") return { wrote: false };

  writeJson(mcpPath, addServerToMcpJson(readJson(mcpPath), connector));
  writeJson(settingsPath, addPermissions(readJson(settingsPath), connector.permissions));
  return { wrote: true };
}
