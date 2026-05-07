# 2026-05-07 — Second-release train (items 4 + 6 + 7 + 8)

Plan for the second release of upgrades motivated by the 28-day usage report (`C:\Users\thinkpad\.claude\usage-data\report.html`). First release (items 3 + 5 + 9) landed as PRs #83 + #84 (P-MAG third surface, Parallel-Actor Gate, deploy-receipt skill, plus the docs-substring lockdown of P-MAG's third surface). This release adds the next layer on top of that gating + lockdown surface.

Per global CLAUDE.md: this plan doc covers ≥4 PRs and >150 LOC across all of them, so it is mandatory before any implementation edit and must be cited in every commit it produces.

## Goal

Close the four remaining friction classes from the 28-day usage report that the first release did not touch:

- **Environment mismatches** (jq missing on Git Bash, CWD drift after `tsc`, Windows case-sensitivity) — kept costing retries because `workspace-surface-audit` did not record the grain.
- **Big-bang multi-file edits** correlating with `partially_achieved` outcomes (landing-page dark theme, market-data-hub wiring) — `superpowers` did not require a stacked-PR plan as a precondition.
- **Verification miscalls** ("tsc from the wrong CWD", "deps not installed") — `verification-loop` hardcoded `npm run X` instead of resolving each project's actual invocations once.
- **Stagnant friction counts** (26 `wrong_approach` + 21 `buggy_code` events trended flat across 28 days) — observation infra captured the events but never harvested them into typed instincts.

Each PR is single-concern, bundled with its own plan-cite, mirrored to its plugin copy in the same commit (lesson from PR #83 mirror drift), and locked under `docs-substrings` + a backing test where prose-rotation risk applies (lesson from PR #84). No PR edits more than one core skill plus its plugin mirror plus its assertion file.

## Per-PR scope

### PR A — `feat(workspace-surface-audit): record environment grain at session start` (item 4)

**Files touched (≤4):**
- `skills/workspace-surface-audit.md` — extend "Audit Inputs / Phase 1: Inventory What Exists" with an **Environment Grain** subsection: shell flavor (`bash` / `zsh` / `pwsh` / `cmd`), OS family + autocrlf state, jq availability, case-sensitive filesystem flag, current CWD baseline, parallel-actor expectation flag.
- `plugins/continuous-improvement/skills/workspace-surface-audit/SKILL.md` — byte-identical mirror in the same commit.
- `src/bin/check-docs-substrings.mts` — lock 3 literals × 2 mirrors = 6 assertions for the new subsection header + the shell-flavor enumeration + the autocrlf bullet.
- `bin/check-docs-substrings.mjs` — regenerated from the `.mts`.

**WILL build:** the Environment Grain subsection as a checklist of named-file probes (no destructive commands), output format that names each grain field with a short rationale.

**Will NOT build:** an automated runner that *executes* the probes. Skill authors the probe list; the agent runs them. No new `bin/` script in this PR.

**Verification:** `npm run verify:all` reports 126 docs-substrings (was 120), all gates green; manual spot-check that the new section renders cleanly.

**Fallback:** revert the skill edit; lockdown assertions can stay if the skill text is restored, but on conflict revert both.

**Lines estimate:** ~30 added to standalone + same to plugin + ~8 to lint manifest = ~70 LOC across 4 files.

### PR B — `feat(superpowers): require a stacked-PR plan for ≥3-file changes` (item 6)

**Files touched (≤4):**
- `skills/superpowers.md` — add a new "Stacked-PR Plan Precondition" non-negotiable rule between "The Basic Workflow" and "Skill Library"; require multi-file changes to produce a plan output (titles, scopes, merge order) for explicit approval before the first edit.
- `plugins/continuous-improvement/skills/superpowers/SKILL.md` — mirror.
- `src/bin/check-docs-substrings.mts` — lock 2 literals × 2 mirrors = 4 assertions (the rule heading + the "≥3 files" trigger phrase).
- `bin/check-docs-substrings.mjs` — regenerated.

**WILL build:** the rule statement, the trigger ("touching ≥3 files OR a layered feature"), the required output shape (per-PR table), and one worked example.

**Will NOT build:** an automated `git diff` counter that enforces the threshold. The rule is a discipline contract on the skill authoring step, not an executable gate.

**Verification:** `npm run verify:all` reports 130 docs-substrings (was 126 after PR A), all gates green.

**Fallback:** revert.

**Lines estimate:** ~25 standalone + same plugin + ~6 lint manifest = ~60 LOC across 4 files.

### PR C — `feat(verification-loop): per-project ladder via .claude/verify-ladder.json` (item 7)

**Files touched (≤6):**
- `skills/verification-loop.md` — add **Phase 0: Resolve the Ladder** before existing Phase 1; defines a manifest file `.claude/verify-ladder.json` with shape `{build, typecheck, lint, test, security, deploy_receipt}`, falls back to sniffing `package.json` `scripts` (or `pnpm-workspace.yaml`, or `Cargo.toml`, etc.) when the manifest is absent. Phases 1–6 read from the resolved ladder instead of hardcoding `npm run X`. Phase 7 already exists; no change.
- `plugins/continuous-improvement/skills/verification-loop/SKILL.md` — mirror.
- `templates/verify-ladder.example.json` — example manifest (TypeScript / Python / Rust starter shapes commented inline).
- `src/bin/check-docs-substrings.mts` — lock 4 literals × 2 mirrors = 8 assertions.
- `bin/check-docs-substrings.mjs` — regenerated.
- `commands/verify.md` (existing) — single line citing the new Phase 0 if appropriate; verify before editing.

**WILL build:** the manifest spec, the resolution order (manifest → sniff → ask), the per-language fallback table, and the deploy-receipt wiring as the final phase for repos that match auto-deploy targets.

**Will NOT build:** an actual `bin/resolve-verify-ladder.mjs` runner. Skill is a contract; the agent runs the resolved commands. Adding a runner is a separate PR if needed.

**Verification:** `npm run verify:all` reports 138 docs-substrings (was 130), all gates green.

**Fallback:** revert. Manifest file is opt-in — repos without `.claude/verify-ladder.json` keep current behavior via the sniff path.

**Lines estimate:** ~60 standalone + same plugin + ~30 template + ~10 lint manifest = ~160 LOC across 6 files.

### PR D — `feat(continuous-learning): harvest friction events into typed instincts (classifier + test only)` (item 8 — trimmed)

**Trim accepted 2026-05-07.** Original scope was 8 files / ~340 LOC bundling the classifier with a `/harvest` slash command and a `SKILL.md` prose addition. Trimmed to **classifier + test only** to match PR C's review surface and avoid the concern-bundling failure mode this session's earlier PRs already paid for once. The slash command + `SKILL.md` prose ship as a separate follow-up PR after this one lands and the operator has confirmed the classifier output is plausible against the live observations.

**Files touched (4):**
- `src/bin/harvest-friction.mts` — new script: scan `~/.claude/instincts/<hash>/observations.jsonl`, classify failure rows into typed instincts (`wrong_approach`, `buggy_code`, `env_issue`, `permission_block`), assign confidence based on frequency + recency, append to `instincts.jsonl` (existing path) with idempotency keys to prevent dupes on re-run. Includes a CLI entrypoint usable as `node bin/harvest-friction.mjs [project-hash]`.
- `src/test/harvest-friction.test.mts` — TDD RED-first: classifier unit tests covering each typed instinct + idempotency on re-run + recency-decay correctness + one historical-row compatibility test for the pre-2026-05-06T00:38Z `tool_response`-vs-`tool_output` schema (per memory `project_observer_field_name_bug.md`).
- `bin/harvest-friction.mjs` — regenerated by `tsc`.
- `test/harvest-friction.test.mjs` — regenerated by `tsc`.

**WILL build:** the classifier (typed enum + heuristics on Bash exit codes / Edit failures / sandbox blocks), the writer (JSONL append with `dedup_key = sha1(type + tool + summary[:120])`), the CLI entrypoint, and the test suite.

**Will NOT build (deferred to a follow-up PR after this one lands):**
- `commands/harvest.md` slash-command wrapper + plugin mirror
- `SKILL.md` prose section under Law 7 explaining the pipeline + plugin mirror
- An automated cron/hook that runs the harvest

The classifier runs as `node bin/harvest-friction.mjs` directly in this PR. Slash-command ergonomics + SKILL.md prose are a follow-up only after the operator confirms the classifier output is plausible.

**Verification:** `npm test` reports +10 tests for the classifier (508 total, up from 498); `npm run verify:all` reports 138 docs-substrings (unchanged from PR C — no prose lockdown in this PR yet); manual run of `node bin/harvest-friction.mjs` against the live observations.jsonl produces a non-empty plausible instincts table.

**Fallback:** revert. The harvest is purely additive — reads observations, writes new instinct rows; no destructive mutation. If the classifier misfires, regenerate from scratch by deleting the new instinct rows by `dedup_key` prefix.

**Lines estimate:** ~140 .mts source + ~80 .mts test + same regenerated `.mjs` files = **~220 LOC across 4 files**. Review parity with PR C.

## Order + dependencies

PRs A, B, C, D are independent at the file level — none modifies a surface another touches. Recommended landing order is by complexity, smallest first, so each lands fast and the train builds on a known-green base:

1. **PR A** (item 4) — smallest scope, ~70 LOC, sets the precedent that lockdown assertions ride with the skill edit.
2. **PR B** (item 6) — small, ~60 LOC, easy review.
3. **PR C** (item 7) — medium, ~160 LOC, introduces the manifest concept that future PRs may extend.
4. **PR D** (item 8 — trimmed) — ~220 LOC, with its own TDD test suite and a runnable script. Goes last so it can reference the now-stable verification ladder from PR C if useful (no hard dep, but cleaner narrative). Slash-command + SKILL.md prose deferred to a separate follow-up PR after this one lands.

If any PR's CI surfaces an issue (like PR #83's `skills-drift` allowlist), fix in-place on that branch (4th commit pattern) before moving to the next PR. **Do not** start the next PR's worktree until the current one is merged — this avoids the parallel-actor trap on the same skills-modify surface.

## Worktree-per-PR scaffolding

One worktree per PR, all branched off the current `origin/main` (= `1a482b0` after PR #84 merge). Branch names:

- `worktree-feat-workspace-grain-2026-05-07` (PR A)
- `worktree-feat-stacked-pr-default-2026-05-07` (PR B)
- `worktree-feat-verify-ladder-2026-05-07` (PR C)
- `worktree-feat-friction-harvest-2026-05-07` (PR D)

Per session reminder + memory `feedback_parallel_actor.md`: only ONE worktree is `in_progress` at any moment. The other three sit dormant until their turn. The first worktree is created at the start of PR A's implementation; PR B's worktree is created only after PR A merges (so its base is `origin/main` updated, not `1a482b0`).

## Carried-in negative prompts (P-MAG Rule 3)

Carried from PRs #83 + #84 sessions:

> Will NOT repeat: editing a skill without mirroring to its plugin copy in the same Edit pass. Every skill edit in this train stages `skills/<name>.md` AND `plugins/continuous-improvement/skills/<name>/SKILL.md` together — `cp` after edit, `diff -q` confirms byte-identical, then commit.

> Will NOT repeat: bundling multiple item concerns in the same file edit. Each PR's commit touches exactly the files listed under its scope; deviations get a separate commit.

> Will NOT repeat: assuming a CI invariant tolerates fork-side additions without an allowlist. Before starting PR D in particular, dry-run `npm run verify:all` locally and check whether any new observation pipeline files land in a path the CI watches.

> Will NOT repeat: editing `.mjs` directly. PR D's source lives at `src/bin/harvest-friction.mts` and `src/test/harvest-friction.test.mts`. `tsc` regenerates the `.mjs`.

> Will NOT repeat: `git add .` / `-A` on Windows. Stage by explicit path every time. `git diff --stat` (not `git status`) confirms the real change set.

> Will NOT repeat: direct push to main. PR-only flow. Use `gh api -X PUT repos/<owner>/<repo>/pulls/<n>/merge -F merge_method=squash` to merge from a worktree (the local `gh pr merge` tries to `git checkout main` and fails because main is held by the parent worktree).

## Risks

- **PR D classifier rot.** The friction-event field schema (`tool`, `output_summary`, `event`) drifted once already (PR #67 — observer captured `tool_response` not `tool_output`). The classifier MUST handle both legacy and current field names with a documented compatibility window. The test suite includes one historical row from before 2026-05-06T00:38Z to lock in this compatibility.
- **PR C ladder edge case.** The `package.json scripts` sniff path will mis-pick `npm test` over `npm run verify:all` for repos that have both. Phase 0 must enumerate the resolution priority, not "first match wins." Document a tie-breaker.
- **PR A grain underspecification.** Recording shell flavor without an enforcement gate is documentation, not enforcement. The next-release WILD item (autonomous release-train) is what would consume the grain — note this explicitly in PR A's text so the value chain is visible.
- **PR B over-constraint.** Requiring a stacked plan for "any 3-file change" could fire on docs-only or dependency-bump commits. The trigger phrase must exclude those classes (markdown-only, lockfile-only, generated-only) explicitly to avoid friction on commits that genuinely don't need a plan.
- **PR D classifier scope creep.** Trimmed scope keeps PR D to classifier + test only. Slash-command + SKILL.md prose are explicitly deferred to a follow-up PR. Resist the temptation to inline either during the PR D worktree session — they belong in their own follow-up PR after the classifier is verified against live observations.

## Out of scope (explicit)

- Anything related to the WILD items 1 (autonomous release-train) and 2 (parallel provider-eval harness). Those wait until the four PRs above are all merged.
- Auditing other Phase 0 / Phase 6 / Phase 7 contracts for missing locked-literal coverage. Operator's directive: lockdown coverage is added incrementally as each phase contract gets touched, not as a sweep.
- Extracting the `deploy-receipt` provider table to a shared YAML (Tier 2 follow-up from PR #83). Still parked.
- Any edit to vendored `third-party/` content.
- Any edit to existing skill files outside the four targeted (e.g., `gateguard.md`, `proceed-with-the-recommendation.md`, `deploy-receipt.md`) — those landed in PRs #83 + #84 and are stable.
- The `/harvest` slash command (`commands/harvest.md` + plugin mirror) and the Law-7 SKILL.md prose section — both deferred to a follow-up PR after PR D's classifier lands and is verified against live observations.
- Any cron / hook / scheduled wrapper for `harvest-friction.mjs`. Manual `node bin/harvest-friction.mjs` only in PR D.

## Approval gate

This plan doc lands as the FIRST commit of PR A. Implementation starts only after the operator confirms the order + scope with one of:

- "ship A first" / "approved, start with PR A" / "go" — proceed with PR A only; PRs B/C/D wait until A merges.
- "merge order is fine but trim PR D" / specific scope adjustment — restate the trimmed scope, await re-confirmation.
- "switch to ralph for the whole train" / "do all four overnight" — re-route through `ralph` per `proceed-with-the-recommendation.md` routing-table rule for "Long-running / PRD-style autonomous execution"; note the operator-explicit authorization for the autonomous mode.
