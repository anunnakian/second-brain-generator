// ─────────────────────────────────────────────────────────────────────────────
// connectors-catalog.mjs — catalogue neutre de sources externes branchables.
//
// Deux familles :
//  • kind:'mcp'    → serveur MCP self-hosted/communautaire. Le bootstrap peut écrire
//                    son `serverConfig` dans .mcp.json et ses `permissions` dans
//                    settings.json (cf. connectors-merge.mjs). Les valeurs d'env sont
//                    des PLACEHOLDERS `<...>` : l'utilisateur renseigne ses vrais
//                    credentials lui-même (neutralité : aucun secret en dur).
//  • kind:'native' → connecteur géré par le compte claude.ai (Slack, Gmail,
//                    Calendar…). Pas de .mcp.json à écrire : on se contente de
//                    pointer l'utilisateur vers les *Connectors* de son compte.
//
// Garder ce catalogue court (2-4 entrées), neutre et crédible.
// ─────────────────────────────────────────────────────────────────────────────

export const CONNECTORS = [
  {
    id: "google-drive",
    label: "Google Drive (serveur MCP communautaire)",
    kind: "mcp",
    serverConfig: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-gdrive"],
      env: {
        GDRIVE_CREDENTIALS_PATH: "<CHEMIN_VERS_credentials.json>",
      },
    },
    permissions: [
      "mcp__google-drive__search",
      "mcp__google-drive__read_file",
    ],
    credentialsHint:
      "Crée un client OAuth Google (scope Drive lecture seule), télécharge le " +
      "credentials.json et renseigne GDRIVE_CREDENTIALS_PATH. Détails : SETUP §6.",
  },
  {
    id: "notion",
    label: "Notion (serveur MCP communautaire)",
    kind: "mcp",
    serverConfig: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@notionhq/notion-mcp-server"],
      env: {
        NOTION_API_TOKEN: "<TON_TOKEN_INTEGRATION_NOTION>",
      },
    },
    permissions: [
      "mcp__notion__search",
      "mcp__notion__fetch",
    ],
    credentialsHint:
      "Crée une intégration interne Notion, partage les pages voulues avec elle, " +
      "puis colle son token dans NOTION_API_TOKEN. Détails : SETUP §6.",
  },
  {
    id: "slack",
    label: "Slack (connecteur natif du compte claude.ai)",
    kind: "native",
    credentialsHint:
      "Slack se branche côté compte claude.ai (Settings → Connectors), pas via " +
      ".mcp.json. Active le connecteur Slack sur ton compte. Détails : SETUP §6.",
  },
  {
    id: "google-calendar",
    label: "Google Calendar (connecteur natif du compte claude.ai)",
    kind: "native",
    credentialsHint:
      "Google Calendar se branche côté compte claude.ai (Settings → Connectors), " +
      "pas via .mcp.json. Active le connecteur sur ton compte. Détails : SETUP §6.",
  },
];
