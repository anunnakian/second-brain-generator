# ADR 0031 — The reconciler may seed (write-if-absent) the engine-owned health-check note — the SINGLE, nominative exception to the vault-sacred invariant

- **STATUS:** ✅ ACCEPTED (2026-06-20) — decision **B** (Thomas, explicitly chosen over "install-only")
  so the `health_check` canary works on **upgraders**, not just new installs. Amends the *Safety
  invariant* of [ADR 0026](0026-brain-self-converges-via-idempotent-reconciler.md) with **one
  narrow, named carve-out**. Lands in **v3.3.0** (F7-bis baby-step "3b"); index format unchanged.
- **Scope:** Second brain (runtime) + Installer — the brain-side reconciler (invoked by `update-engine`
  as a child process) may seed one engine-owned note; the installer already seeds it via the install-time
  vault bulk-copy.
- **Related:**
  [`0026-brain-self-converges-via-idempotent-reconciler.md`](0026-brain-self-converges-via-idempotent-reconciler.md)
  (the vault-sacred *Safety invariant* this amends — narrowly),
  [`0030-engine-modules-expose-a-health-check-port-callers-own-the-policy.md`](0030-engine-modules-expose-a-health-check-port-callers-own-the-policy.md)
  (the `health_check` protocol whose RAG canary targets this note),
  [`0009-prefer-deterministic-event-condition-over-probabilistic.md`](0009-prefer-deterministic-event-condition-over-probabilistic.md)
  (write-if-absent on a verifiable on-disk condition — deterministic, idempotent),
  [`0015-mac-windows-parity-regenerate-launchers.md`](0015-mac-windows-parity-regenerate-launchers.md)
  (the seed + targeted reindex must behave identically on macOS/Windows/Linux).

## Context

ADR 0030 makes `vault-rag` expose a `health_check` whose RAG dimension is a **canary**: search a unique,
invented token (`Quibblethorne`) and require it to surface. F7-bis baby-step 3 moved that canary off the
**deletable demo note** onto a **dedicated, engine-owned note** — `vault/engine-health/health-check.md`
(no `exemple` tag → survives the demo purge). The note is engine content, **not** a user note.

That note reaches **new installs** for free (the install-time vault **bulk-copy**), then the initial
indexing makes the canary green. But it does **not** reach **upgraders**:

- `rag/src/**` is in `regimes.replace`, so `/update-engine` **does** carry the new canary code (the
  `Quibblethorne` token + the `canaryNoteExists` seam) to an existing brain.
- BUT the reconciler — per ADR 0026's *Safety invariant* — **never touches the vault**, so the dedicated
  note is **not** placed. And v3.3.0 keeps `indexSchemaVersion` at 1, so `update-engine` runs **no
  reindex** (`needsReindex` is false).

Net effect with "install-only": an upgrader's canary is **`unknown` forever** (note absent → `unknown`,
never `broken` — safe, but the most valuable health signal is permanently dark for the existing cohort).

**The trap to avoid.** Naïvely seeding the note at update **without** indexing it would be *worse* than
`unknown`: the note would be on disk (`canaryNoteExists` → true) while the index has **zero** hits and the
embedder ran fine → `buildHealthCheck` returns **`broken`** ("canary not found"). A false alarm. So seeding
**must** be paired with making the note searchable.

## Decision

**Allow the reconciler exactly ONE write into the vault: seed the engine-owned health-check note if (and
only if) it is absent, and incrementally reindex only when it was just seeded. Everything else in the vault
stays untouchable.** The vault-sacred rule of ADR 0026 **remains the rule**; this is its **single,
nominative exception**.

1. **Seed-if-absent, write-only, one path.** At a **real update** (`sourceDir !== brainDir`), if
   `vault/engine-health/health-check.md` does **not** exist in the brain, copy it from
   `sourceDir/vault/engine-health/health-check.md`. **Never overwrite, never delete**; the carve-out is
   scoped to that **exact single path**. (SessionStart self-heal runs with `sourceDir === brainDir` → it
   cannot self-seed and does not try; upgraders get the note via the `update-engine` child.)
2. **Targeted, incremental reindex — only on a fresh seed.** Right after a seed, run an **incremental**
   reindex. The index-manager skips unchanged docs by hash, so **only the one new note is encoded** — this
   is the cheap incremental path, **not** the schema-change full re-encode v3.3.0 deliberately avoids.
   If nothing was seeded (the common case — note already present), **no reindex** runs.

### Amendment to ADR 0026's Safety invariant

> ADR 0026 reads: *"The vault, `.env`, the constitution, settings, … are untouchable."* This ADR amends
> that **single clause** to: the **vault is untouchable EXCEPT** the reconciler MAY **create** (never
> overwrite, never delete) the one engine-owned file `vault/engine-health/health-check.md` when it is
> absent. `.env`, the constitution, settings, every user-added `.mcp.json` server, every non-declared /
> custom skill, **and every user note** remain fully untouchable. No other vault path is ever written.

### Safety invariants (every reconciler test asserts)

- **One path only.** The ONLY vault path the reconciler may ever write is
  `vault/engine-health/health-check.md`. A test asserts no user note is created, modified, or removed.
- **Write-if-absent.** An existing note is never overwritten; a present-and-unchanged note triggers **no**
  write and **no** reindex.
- **Idempotent.** A second reconcile run = zero writes, zero reindex, zero git churn.
- **No false `broken`.** Whenever the note is seeded, the paired incremental reindex makes the canary
  findable, so the post-seed verdict is `ok` (or `unknown` on a missing key) — **never** a seeded-but-
  unindexed `broken`.

## Consequences

- **Upgraders get a real canary.** After one `/update-engine`, an existing brain has the dedicated note
  seeded and indexed → `health_check` reports a true end-to-end retrieval verdict instead of `unknown`.
- **The vault-sacred guarantee is preserved in substance.** User data is still never read-for-mutation,
  never overwritten, never deleted. The only thing the engine grants itself is (re)placing **its own**
  health file, in **its own** namespace (`engine-health/`), and only when missing.
- **Bounded blast radius.** The exception is a single hard-coded path, enforced by tests — it cannot drift
  into "the reconciler may write the vault" in general.
- **Cross-platform.** The seed copy reuses the reconciler's self-copy-guarded `copyInto`; the incremental
  reindex uses the existing seam. Both must be verified on the `win32` branch (ADR 0015).
- **Honest residual.** A brain that never re-runs `update-engine` after upgrading keeps an `unknown` canary
  (safe). The carve-out activates on the next real update, which is the expected path.

## Rejected / deferred alternatives

- **Install-only (the rejected default).** Simplest and fully safe, but leaves every upgrader's canary
  permanently `unknown` — the feature would not serve the existing cohort. Rejected by decision B.
- **Seed at update WITHOUT reindex.** Produces a false `broken` (note on disk, zero index hits). Rejected
  — the targeted incremental reindex is mandatory.
- **Full reindex at update to pick up the note.** Re-encodes the whole vault (minutes, ONNX) for one tiny
  note, and contradicts v3.3.0's "no forced reindex". Rejected in favor of the incremental, single-doc path.
- **Seed in the SessionStart self-heal too.** It runs with `sourceDir === brainDir` (nothing to copy from)
  and writing into the vault on **every** session start widens the blast radius for no gain. Deferred /
  rejected: the `update-engine` child is the right, bounded place.
- **Widen the carve-out to "engine-owned notes" generally.** Rejected as premature generalization; the
  exception stays nominative (this one path) until a second engine note ever justifies revisiting.
