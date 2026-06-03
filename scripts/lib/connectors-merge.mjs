// ─────────────────────────────────────────────────────────────────────────────
// connectors-merge.mjs — fusions pures et idempotentes pour brancher un connecteur.
// addServerToMcpJson : injecte un bloc serveur dans .mcp.json.
// addPermissions     : ajoute des permissions à settings.json sans doublon.
// Les deux ne mutent PAS leur entrée : elles renvoient une copie.
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
