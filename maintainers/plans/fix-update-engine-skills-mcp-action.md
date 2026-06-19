# Fix — `update-engine` must deliver engine skills + MCP servers (v3.2.1)

> **Origin:** QA finding #1 (`maintainers/qa/qa-v3.2.0.md`). Proven empirically on a v3.1.0→v3.2.0
> upgraded brain: `update-engine` copies the `local-mirror/` **code** but installs neither the
> **skill** (`.claude/skills/` is a blanket sacred tree) nor the **MCP server**
> (`engineMcpServers` is declared in `engine-manifest.json` but never consumed). Result: anyone who
> **updates** to v3.2.0 does not get the flagship feature; only a **fresh install** does.
>
> **Goal:** an engine update delivers engine-owned skills and registers engine MCP servers, while
> **never** touching the user's custom skills or custom connectors. Ship as **v3.2.1** (also bundles
> the npm vuln patch).
>
> **Branch:** `fix-update-engine-skills-mcp` (off `main`, post-v3.2.0 — no rebase).
> **Discipline:** TDD baby-steps, commit-only-green.

## Tracking

- [ ] **Lot 0 — Investigation & design decisions** (no code; resolve the open questions below)
- [ ] **Lot A — Install engine-declared skills on update** (TDD)
- [ ] **Lot B — Reconcile `.mcp.json` from `engineMcpServers`** (TDD)
- [ ] **Lot C — Self-heal path for already-broken v3.2.0 brains** (decided in Lot 0)
- [ ] **Lot D — npm vulnerability remediation** (TDD where it touches behavior)
- [ ] **Lot Ship — verify green, `/code-review`, merge, tag v3.2.1, archive, re-run QA §3**

---

## Lot 0 — Investigation & design decisions

- [ ] **Q1 — Where does the apply run from?** Read the `update-engine` execution flow and confirm
      whether the apply plan is computed/executed by the brain's **currently-installed** code or by
      the **freshly-fetched** engine code. This decides whether a broken v3.2.0 brain self-heals on
      the v3.2.1 update, or stays broken for one extra cycle (chicken-and-egg). → drives Lot C.
- [ ] **Q2 — Engine-skill regime semantics.** Engine skills are listed under `merge` in the manifest
      but are **engine-owned** (the user isn't expected to edit `local-mirror/SKILL.md`). Decide:
      install/overwrite the manifest-declared skill paths wholesale (like `replace`, but scoped to
      declared engine-skill paths), keeping true `merge` only for genuinely user-editable files
      (CLAUDE.md, settings). Record the decision.
- [ ] **Q3 — MCP server source of truth.** Confirm the engine server definitions come from the
      fetched `.mcp.json.template` (so the update reads the new template, extracts the
      `engineMcpServers` defs, substitutes `{{PROJECT_ROOT}}` → brain dir, merges only the missing
      ones). Verify `.mcp.json.template` is reachable from the fetched engine.
- [ ] **Q4 — Safety invariant, written down.** "Only skills/servers the manifest declares as
      engine-owned are ever written; everything else under `.claude/skills/` and any user-added MCP
      server is untouchable." This is the property every new test asserts.
- [ ] **ADR** — capture the engine-owned-vs-user distinction in the sacred scrub (new ADR, Scope:
      *Second brain (runtime) + Installer*).

## Lot A — Install engine-declared skills on update

- [ ] RED: test — given a manifest declaring `.claude/skills/local-mirror/**` as engine-owned and a
      brain without it, the apply plan **installs** the skill.
- [ ] RED: test — a **user** skill (`.claude/skills/zzz-mine/**`, NOT in the manifest) is **never**
      written/removed (sacred preserved).
- [ ] GREEN: carve the manifest-declared engine-skill paths out of the blanket `SACRED_TREES` scrub
      in `engine-apply-plan.mjs`; route them to the chosen regime (per Q2).
- [ ] Refactor; full `scripts/lib` suite green.
- [ ] Verify empirically on the golden master: after update, `.claude/skills/local-mirror/` exists.

## Lot B — Reconcile `.mcp.json` from `engineMcpServers`

- [ ] RED: test — given a brain `.mcp.json` with only `vault-rag`, reconciling against
      `engineMcpServers: ["vault-rag","local-mirror"]` **adds** `local-mirror` (cwd = brain dir).
- [ ] RED: test — a **user-added** server in `.mcp.json` is **preserved** (never clobbered).
- [ ] RED: test — re-running is **idempotent** (already-present engine server → no duplicate, no diff).
- [ ] GREEN: implement the reconcile step (read fetched `.mcp.json.template`, substitute path, merge
      missing engine servers) and wire it into `update-engine`.
- [ ] Refactor; suite green.
- [ ] Verify empirically on the golden master: after update, `.mcp.json` has `local-mirror`, and the
      conversation routes "wire up a Notion zone" → the **local-mirror** skill (asks the
      mirror-vs-native disambiguation), not `sync-sources`.

## Lot C — Self-heal for already-broken v3.2.0 brains

- [ ] Based on Q1: if apply runs from fetched code → confirm self-heal is automatic (add a test that
      simulates the broken→fixed transition). If it runs from installed code → implement a one-shot
      idempotent heal in the v3.2.1 update, **or** document a manual heal for the few v3.2.0 early
      adopters (re-install toward a fresh brain, or copy the skill + add the MCP entry).
- [ ] Record the chosen path in the plan + ADR.

## Lot D — npm vulnerability remediation

- [ ] `npm audit fix` in `rag/` for the **non-breaking** ones (`hono`, `protobufjs`); re-run audit.
- [ ] `gray-matter` 1.x→2.x (js-yaml fix) is **breaking** → bump behind the **full RAG test suite**
      (frontmatter parsing is core); fix any fallout, tests green.
- [ ] Re-run `npm audit` → confirm clean (or document any residual + rationale).
- [ ] Bump `rag` engine version + manifest accordingly.

## Lot Ship

- [ ] All three suites green (harness / rag / local-mirror) + `tsc` clean.
- [ ] `/code-review` on the branch; fix findings in TDD (commit-only-green).
- [ ] Re-run QA `§3 local-mirror` on the golden master end-to-end (the campaign that was BLOCKED).
- [ ] Push, PR, merge to `main` on Thomas's explicit green light.
- [ ] Tag **v3.2.1** + codename; update README `latest` expectation.
- [ ] Archive this plan (`plans/archived/`, ✅ status + proof); tick QA finding #1 + #2 as resolved.
- [ ] Purge / restore the golden master; confirm no confidential data leaked.
