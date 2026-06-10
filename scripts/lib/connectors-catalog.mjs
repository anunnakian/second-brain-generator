// ─────────────────────────────────────────────────────────────────────────────
// connectors-catalog.mjs — neutral catalog of pluggable external sources.
//
// Two families:
//  • kind:'mcp'    → self-hosted/community MCP server. The installer can write
//                    its `serverConfig` into .mcp.json and its `permissions` into
//                    settings.json (see connectors-merge.mjs). The env values are
//                    PLACEHOLDERS `<...>`: the user fills in their real
//                    credentials themselves (neutrality: no hard-coded secret).
//  • kind:'native' → connector managed by the claude.ai account (Slack, Gmail,
//                    Calendar…). No .mcp.json to write: we just point the user to
//                    the *Connectors* of their account.
//
// `useCases`: for each connector, a few "what for" ideas — shown by the wizard
// to help the user choose, and reused in the docs (README §Connectors, SETUP §6,
// CONNECTORS.md). Meeting transcripts (Meet/Gemini) are NOT a third-party product
// to plug in: it's a use case served by Google Calendar (the link is often in the
// invite) + Google Drive (where the transcription doc lands). So we cite them in
// useCases, not as an entry.
//
// Keep this catalog short and credible (≤ 8 entries), neutral, no hard-coded secret.
// ─────────────────────────────────────────────────────────────────────────────

export const CONNECTORS = [
  {
    id: "google-drive",
    label: "Google Drive (community MCP server)",
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
    useCases: [
      "Find and read documents (specs, minutes, exports).",
      "Fetch meeting transcripts (Meet/Gemini): the transcription doc lands on Drive — search by modification date then read it.",
    ],
    credentialsHint:
      "Create a Google OAuth client (read-only Drive scope), download the " +
      "credentials.json and set GDRIVE_CREDENTIALS_PATH. Details: SETUP §6.",
  },
  {
    id: "notion",
    label: "Notion (community MCP server)",
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
    useCases: [
      "Search across your Notion databases and pages (product specs, wikis, knowledge bases).",
      "Read a specific page to cross-reference it with your vault notes.",
    ],
    credentialsHint:
      "Create an internal Notion integration, share the desired pages with it, " +
      "then paste its token into NOTION_API_TOKEN. Details: SETUP §6.",
  },
  {
    id: "slack",
    label: "Slack (native connector of the claude.ai account)",
    kind: "native",
    useCases: [
      "Search for messages and threads on a topic or a person.",
      "Read a channel or the unreads to catch what changed since the last pass.",
    ],
    credentialsHint:
      "Slack is wired on the claude.ai account side (Settings → Connectors), not via " +
      ".mcp.json. Enable the Slack connector on your account. Details: SETUP §6.",
  },
  {
    id: "gmail",
    label: "Gmail (native connector of the claude.ai account)",
    kind: "native",
    useCases: [
      "Find an email or a thread on a topic, a client, a commitment.",
      "Catch decisions and actions exchanged by email to cross-reference them with your notes.",
    ],
    credentialsHint:
      "Gmail is wired on the claude.ai account side (Settings → Connectors), not via " +
      ".mcp.json. Enable the Gmail connector on your account. Details: SETUP §6.",
  },
  {
    id: "google-calendar",
    label: "Google Calendar (native connector of the claude.ai account)",
    kind: "native",
    useCases: [
      "Read the day's / week's agenda to give context to a question or a briefing.",
      "Fetch meeting transcripts (Meet): the recording/transcription link is often attached to the event invite.",
    ],
    credentialsHint:
      "Google Calendar is wired on the claude.ai account side (Settings → Connectors), " +
      "not via .mcp.json. Enable the connector on your account. Details: SETUP §6.",
  },
];
