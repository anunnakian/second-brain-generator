# Connectors — wiring up your external sources

The generator's RAG engine answers from **your notes** (the `vault/`). **Connectors** give it
access to your **other sources** — mail, calendar, Notion, files, chat — so it can cross-reference
everything in one place. **Everything is optional**: with no connector at all, the second brain
already works — it answers on its own from the vault.

This file is an **idea menu** to help you choose *what* to wire up based on *your* need. The
*how* (wizard, manual, credentials) is detailed in [SETUP §6](SETUP.md).

---

## Two families of connectors

| Family | What it is | Where it plugs in |
|---|---|---|
| **Native claude.ai** | A connector managed by your claude.ai account (Slack, Gmail, Calendar, Notion, Drive…). | Account-side: *Settings → Connectors*. **Nothing** to write in `.mcp.json`. |
| **Community MCP** | An MCP server you host/run yourself (often an npm package). | In `.mcp.json` (the installer wizard can do it for you) + permissions in `.claude/settings.json`. |

> Several sources exist **in both families** (e.g. Google Drive, Notion). The **native** one is
> generally the simplest to get started; the **community MCP** gives you more control (scopes,
> self-hosting, your own credentials).

---

## Menu — which connector for which need

| You want to query… | Connector idea | Family | What it's for |
|---|---|---|---|
| **Notes / wikis** Notion | `@notionhq/notion-mcp-server`, or native Notion | MCP **or** native | Search your databases/pages (specs, wikis, KB); read a page to cross-reference with your notes. |
| **Mail** | Native Gmail | native | Find a mail/thread on a topic, a client, a commitment; capture decisions and actions exchanged by mail. |
| **Calendar** | Native Google Calendar | native | Read the day's/week's calendar to give context to a question or a briefing. |
| **Files / documents** | `@modelcontextprotocol/server-gdrive`, `@isaacphi/mcp-gdrive`, or native Drive | MCP **or** native | Find and read specs, meeting notes, exports. |
| **Team chat** | Native Slack | native | Search messages and threads; read a channel / unreads to capture what's moved. |
| **Meeting transcripts** (Meet) | **Calendar + Drive** | native + MCP | See the dedicated section below. |

---

## 🎙️ Meeting transcripts — a use case, not a connector

This is the classic trap: people go looking for "the transcripts connector." **You don't need
one.** When you record a video call (Google Meet / Gemini), the transcription shows up in **two
places** you've probably already wired up:

1. **In the event invitation** → the link to the recording / transcription is often attached to
   the event. You retrieve it via **Google Calendar**.
2. **On your Google Drive** → the **transcription document** lands there automatically. You find it
   via **Google Drive** (search recent docs, then read the right one).

So: wire up **Calendar** *and* **Drive**, and your transcripts are accessible — **without**
depending on a third-party meeting-bot tool (Fireflies, Fathom, Granola, tl;dv…). If you use one
of these tools and it exposes an MCP, you can add it on top, but it's **not necessary** to get
started.

---

## How to wire them up

Three paths, detailed in [SETUP §6](SETUP.md):

- **(a) The installer wizard** *(recommended)* — at step **5/9**, it offers the catalog, shows you
  **what each source is for**, and for **MCP** connectors it writes the server block in `.mcp.json`
  + the permissions in `.claude/settings.json` all on its own (idempotent).
- **(b) By hand** — you add the MCP server in `.mcp.json` and the permissions yourself.
- **(c) Native claude.ai connectors** — nothing in `.mcp.json`: enable them from your account's
  *Settings → Connectors*.

> 🔐 **Neutrality / security.** The generator hardcodes **no secret**: MCP credentials are `<…>`
> placeholders that **you** fill in. Never commit your real tokens.

---

## Once wired up — document the routing

When a connector is in place, tell Claude **which tool for what** in your `CLAUDE.md`
(section **4. Routing**, sub-part *External sources*). That's what keeps it from hesitating between
two overlapping MCPs. Example table to fill in:

| Source | MCP tool | When to use it |
|---|---|---|
| Drive | `mcp__<drive>__search` | document discovery / recent transcripts |
| Calendar | `mcp__<calendar>__list_events` | today's calendar, transcription link in the event |
| … | … | … |

The internal tooling [`sync-sources`](.claude/skills/sync-sources/SKILL.md) (the engine of Phase 2
— pulling the **delta** of sources in **read-only** sub-agents) relies on these connectors. Replace
its `mcp__<slack>__…`, `mcp__<drive>__…` placeholders with the real names of your tools.
