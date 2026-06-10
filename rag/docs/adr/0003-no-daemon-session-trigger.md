# 0003 — No daemon: the session is the trigger

- **Status**: Accepted
- **Date**: 2026-05-31

## Context

We want an "idiot-proof" RAG: no manual triggering, no temporal coupling to be
aware of, nothing that spoils. The natural temptation to get there: a daemon
(launchd/cron) that re-indexes the vault in the background continuously.

## Decision

**No permanent background process.** The indexing trigger is the **opening of a
session** in Claude Code: the MCP server launches an incremental reindex at
startup (see [0002](0002-non-blocking-mcp-startup.md)). Since we open a session
precisely when we want to "talk" to the vault, the act of use IS the trigger. The
index converges session after session.

## Consequences

- Zero hidden moving parts: no daemon to debug, monitor, or restart. No silent
  failure mode outside a session.
- The vault's daily delta is tiny (~10 chunks/day) → per-session convergence is
  amply sufficient.
- **Accepted limitation**: if the vault is modified without ever opening a session,
  the index does not progress. Acceptable given real usage (you open a session to
  use it).
- **Invariant not to violate**: do not introduce an indexing daemon/cron "to do
  things properly". If one day the need for off-session indexing becomes real, it
  justifies a **new ADR** that supersedes this one — not a quiet addition.

## Rejected alternatives

- **launchd daemon** — solves off-session indexing but adds a silent failure mode
  and operational complexity disproportionate to the gain.
- **File watcher (fs.watch)** — same objection, plus the fragility of watching a
  vault synchronized via git across laptops.
