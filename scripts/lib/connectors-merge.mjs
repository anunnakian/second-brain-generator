// ─────────────────────────────────────────────────────────────────────────────
// connectors-merge.mjs — pure, idempotent merges for wiring a connector.
// addServerToMcpJson : injects a server block into .mcp.json.
// addPermissions     : adds permissions to settings.json without duplicates.
// Neither MUTATES its input: they return a copy.
// ─────────────────────────────────────────────────────────────────────────────

export function addServerToMcpJson(mcpObj, connector) {
  return {
    ...mcpObj,
    mcpServers: { ...mcpObj.mcpServers, [connector.id]: connector.serverConfig },
  };
}

export function addPermissions(settingsObj, perms = []) {
  const allow = settingsObj.permissions?.allow ?? [];
  const fresh = perms.filter((p) => !allow.includes(p));
  return {
    ...settingsObj,
    permissions: { ...settingsObj.permissions, allow: [...allow, ...fresh] },
  };
}
