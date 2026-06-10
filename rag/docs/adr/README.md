# Architecture Decision Records — RAG vault

Architecture decisions for the RAG engine (`rag/`). **Close to the code**,
versioned with it: a dev who touches the RAG should see these decisions without
opening the Obsidian vault.

> Not to be confused with `vault/decisions/` — that one is for the second brain's
> content (strategy, management). Here: **technical** decisions of the engine.

## Format

MADR-lite: **Context / Decision / Consequences / Status**. Short (~15-25 lines).
No ceremony. Numbering `NNNN-title-kebab.md`, incremental, never reused.

## Living rule

**Any new architecture decision → an ADR in the same commit as the code.** A
decision is not "made" until it is written here. We do not rewrite a past ADR: if
we change our mind, we create a new one that *supersedes* the old one (status
`Superseded by NNNN`).

## Index

| # | Title | Status |
|---|---|---|
| [0001](0001-atomicity-document-hash-chunks.md) | Per-document indexing atomicity (hash ⇔ chunks) | Accepted |
| [0002](0002-non-blocking-mcp-startup.md) | Non-blocking MCP startup (transport first, reindex in background) | Accepted |
| [0003](0003-no-daemon-session-trigger.md) | No daemon — the session is the trigger | Accepted |
