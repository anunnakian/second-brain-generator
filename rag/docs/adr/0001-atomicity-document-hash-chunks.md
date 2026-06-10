# 0001 — Per-document indexing atomicity (hash ⇔ chunks)

- **Status**: Accepted
- **Date**: 2026-05-31 (retroactive formalization of a decision already in place)

## Context

Indexing embeds a document's chunks then persists everything. The incremental
diff skips a file if its hash in the database is identical to its current hash.
At the quota wall, indexing stops mid-batch. If a document could end up with its
`hash` written but its `chunks` missing (or partial), it would be wrongly
"skipped" on the next run → a silent, permanent hole in the index.

## Decision

Persist a document **atomically**: delete the old chunks, insert the new ones,
write the `hash`, all within **a single SQLite transaction**
(`vector-store.ts:indexDocument`). A document is either completely indexed (hash
+ all of its chunks), or not at all. The indexer persists **one document at a
time** (`indexer.ts`), and any completed document is safe immediately.

## Consequences

- Resuming after a quota wall is **free and safe**: the docs already persisted
  are complete, the hash diff skips them, and the next run resumes where it left off.
- **Invariant not to violate**: never write a document's `hash` outside the same
  transaction as its chunks. Separating the two (e.g. "optimizing" by writing
  hashes in a batch at the end) reintroduces the silent hole. The hash IS the
  marker for "this doc is fully indexed".

## Rejected alternatives

- **Global batch then final commit** — apparently faster, but a crash / quota
  wall leaves an ambiguous partial state. Unacceptable for an index we want to
  be self-healing.
- **Separate "in progress" marker** — needless complexity: the atomic
  transaction provides the same guarantee with no intermediate state.
