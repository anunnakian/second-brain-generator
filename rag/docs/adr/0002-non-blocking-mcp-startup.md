# 0002 — Non-blocking MCP startup (transport first, reindex in background)

- **Status**: Accepted
- **Date**: 2026-05-31 (retroactive formalization of a decision already in place)

## Context

The `vault-rag` MCP server starts on every Claude Code session opening. An
earlier version launched the auto-reindex **before** opening the stdio transport:
the MCP handshake arrived too late → Claude Code marked the server "failed"
(timeout) while it was just finishing indexing. Moreover, an embedding error
(quota) during that reindex killed the process at startup.

## Decision

In `index.ts:main` (server mode): **open the stdio transport first**
(`server.connect`), log "running", **then** launch the incremental auto-reindex
as a background task (`reindex(false)`, not awaited). The reindex's `.catch` logs
the failure without killing the server. Searches work during the reindex (SQLite WAL).

## Consequences

- Instant handshake → no more "failed" at startup.
- A quota wall or an embedding error at startup is **non-fatal**: the server
  stays up and queryable.
- **Invariant not to violate**: never `await` the reindex before `server.connect`,
  and never let an error from the startup reindex propagate uncaught. A "cleanup"
  of `main()` that re-sequences this reintroduces the timeout and the fragility.

## Rejected alternatives

- **Synchronous reindex at boot** — easy to read but makes startup fragile and slow.
- **No reindex at startup at all** — the index would drift from the vault; we want
  per-session convergence (see [0003](0003-no-daemon-session-trigger.md)).
