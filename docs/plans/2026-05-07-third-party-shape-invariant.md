# 2026-05-07 — Third-party shape invariant check

Plan for the deferred follow-up #2 from the addy-agent-skills (#79) and ruflo-swarm (#80) vendor PRs. Single-concern PR. TDD RED → GREEN → REFACTOR.

## Goal

Add a CI invariant that fails when any `third-party/<name>/` snapshot drifts out of the playbook shape. The threshold the original plans named (4 snapshots) is now reached: `oh-my-claudecode`, `superpowers`, `addy-agent-skills`, `ruflo-swarm`. With four snapshots the failure mode is real — a future vendor PR could ship without `OUR_NOTES.md`, without `LICENSE`, without a matching `MANIFEST.md` row, or with a non-pinned SHA, and nothing in CI would catch it.

## Invariant rules

For each `third-party/<name>/` directory (excluding regular files at the `third-party/` root, namely `MANIFEST.md` and `README.md`):

1. **`OUR_NOTES.md`** exists and is non-empty.
2. **`LICENSE`** exists.
3. **`third-party/MANIFEST.md`** has at least one `### <heading>` block whose `Local path` row points at this snapshot directory.
4. That MANIFEST entry has a **`Pinned SHA`** row containing a **40-char lowercase hex string** wrapped in backticks (matches the existing convention).

The mapping between snapshot directory and MANIFEST heading is **NOT identity** (e.g., dir `superpowers` ↔ heading `obra/superpowers`; dir `addy-agent-skills` ↔ heading `addyosmani/agent-skills`; dir `ruflo-swarm` ↔ heading `ruvnet/ruflo (plugins/ruflo-swarm slice)`). The check must look up by `Local path`, not by name.

A snapshot dir without a matching MANIFEST entry — or a MANIFEST entry without a corresponding snapshot dir — is also a drift to flag.

## Step plan

| Step | Action | Verification |
|---|---|---|
| 1 | Worktree `feat/third-party-shape-invariant` off `origin/main@6c73103` | `git worktree list` + clean status |
| 2 | This plan doc | merged into the same single-concern PR |
| 3 (RED) | Write `src/test/check-third-party-shape.test.mts` covering the 4 invariant rules; the test imports from `../bin/check-third-party-shape.mjs` which does not exist yet | `npm test` fails with module-not-found at the import line |
| 4 (GREEN) | Write `src/bin/check-third-party-shape.mts`: discover snapshots, parse MANIFEST.md, validate shape; print `OK` / `FAIL` lines like `bin/check-routing-targets.mjs` does | `npm test` passes; `node bin/check-third-party-shape.mjs` exits 0 against current 4 snapshots |
| 5 (REFACTOR) | Tidy duplicated logic, confirm 0 type errors, run full `npm test` (existing 479 + new tests) | typecheck + tests both green |
| 6 | code-reviewer agent on the diff (TDD discipline, no over-engineering, single-concern) | review report attached to PR |
| 7 | finishing-a-development-branch — squash-merge ready check, ahead-of-origin baseline check, no drive-by changes | branch ready for single squash commit |
| 8 | Open PR vs `main` — `feat(invariant): fail verify when third-party snapshot is missing OUR_NOTES.md, LICENSE, or MANIFEST pin` | single concern, no edits to vendored content |

## Wiring decision

The check runs as part of `npm test` automatically because `package.json` already does `node --test test/*.test.mjs` and `tsc` emits `test/check-third-party-shape.test.mjs` from the `.mts` source. **No `package.json` edit needed.** Keeping the wiring change out of this PR is single-concern protection.

A future PR can add an explicit `npm run verify:third-party` script if a separate gate is wanted; not done here.

## Carried-in negative prompts (P-MAG Rule 3)

> Will NOT repeat: editing `.mjs` directly. The source lives at `src/bin/check-third-party-shape.mts` and `src/test/check-third-party-shape.test.mts`. `tsc` emits the `.mjs` artifacts.
>
> Will NOT repeat: bundled concerns. This PR ships **only** the new invariant check — its source files, its test, the plan doc. No `package.json` edit. No driver entry (deferred #1 still parked). No edits to existing snapshots. No edits to `MANIFEST.md` itself (the check reads MANIFEST.md, doesn't modify it).
>
> Will NOT repeat: `git add .` / `-A`. Stage by explicit path. Discard `package-lock.json` drift before stage if `npm install` exposes the version-field drift again.
>
> Will NOT repeat: skipping RED. The test file lands first and is committed to fail (or runs once with a broken import to confirm it fails) before the implementation source is written.

## Risks

- **Heading-to-dir mapping ambiguity.** Three of the four current MANIFEST headings differ from the dir name. The check must look up by `Local path`, not by name. The test will cover at least one snapshot whose heading != dir name (e.g., `superpowers` ↔ `obra/superpowers`).
- **Unused MANIFEST entries.** The "Pending snapshots (not yet vendored)" section at the bottom of MANIFEST.md (`HKUDS/CLI-Anything`, `phuryn/pm-skills`) has `### <heading>` blocks but no `Local path` rows. The check must treat absence of `Local path` as "not a vendored entry, skip" rather than as drift.
- **False positive on `third-party/.gitkeep` or stray files.** Defensive: only iterate over directories at `third-party/`, not regular files.
- **Test isolation.** Test must use `mkdtempSync` fixtures (same convention as `check-routing-targets.test.mts`) so it doesn't depend on the live `third-party/` state — that would couple the test to ongoing snapshot evolution.

## Out of scope (explicit)

- Wiring a new `npm run verify:third-party` script (test pickup is automatic; explicit script is over-engineering for one check)
- Editing existing snapshots, even if the check exposes a real shape gap on them (any such fix is a separate PR)
- Adding driver SNAPSHOTS entries to `bin/refresh-third-party.mjs` (deferred #1 — still parked)
- Anything related to the ruflo or addy plugin contents
- Any change to `third-party/MANIFEST.md` or any `OUR_NOTES.md`
