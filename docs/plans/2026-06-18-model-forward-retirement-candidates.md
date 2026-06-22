# Model-forward Retirement Candidate Review

- Date: 2026-06-18
- Status: proposal plus follow-up cleanup; no skill deletion, tier change, hook behavior change, MCP/schema change, release action, deployment, or cron change. The 2026-06-18 follow-up corrected the stale `strategic-compact` source/generated skill docs only.
- Scope: re-check the `model-forward` retirement-candidate list against the current live skill catalog after the `para-memory-files` retirement

## Purpose

The `model-forward` stance says skills are scaffolding that should shrink when native model or host behavior covers the same job. That stance is valuable only if retirement candidates are handled deliberately: inspect the live repo, name native/residual coverage, propose decisions, and leave final authority with the operator.

This note updates the 2026-06-10 audit for the current repository state. It is not a removal plan and it does not approve deletion. Any actual skill retirement still needs an owner/Fatin decision, a narrow PR, generated mirror updates, and the full verification ladder.

Follow-up applied on 2026-06-18: the safe autonomous cleanup in this note was completed for `strategic-compact`. The source skill and generated plugin mirror now document it as a manual phase-boundary checklist rather than a bundled `suggest-compact.js` PreToolUse hook. Further retirement or slimming still requires owner/Fatin approval.

## Sources inspected

- `skills/model-forward.md` and `commands/model-forward.md` for the decision rules.
- `docs/audits/2026-06-10-model-forward-audit.md` for the original candidate list.
- Current candidate skill files: `skills/strategic-compact.md`, `skills/handoff.md`, `skills/token-budget-advisor.md`, `skills/safety-guard.md`, and `skills/superpowers.md`.
- Current catalog and dependency surfaces: `skills/README.md`, `docs/skills.md`, `CONTRIBUTING.md`, `docs/using-this-plugin.md`, `src/hooks/companion-preference.mts`, `src/bin/check-docs-substrings.mts`, and `src/test/companion-preference-hook.test.mts`.
- Current source catalog probe: `skills/` contains 24 source skill files plus the root core `SKILL.md` for the documented 25-skill bundle; `para-memory-files` no longer exists as a source skill or command.

## Current catalog facts

| Fact | Current state |
|---|---|
| Root/core skill | `SKILL.md` remains the 7 Laws core. |
| Source skill files under `skills/` | 24 markdown skill files, excluding `skills/README.md`. |
| Documented shipped total | 25 skills = 1 core + 1 featured + 6 tier-1 + 14 tier-2 + 3 companion. |
| Original audit candidate already removed | `para-memory-files` is absent from `skills/` and `commands/`; only historical audit/report references remain. |
| Remaining live candidates from the audit | `strategic-compact`, `handoff`, `token-budget-advisor`, `safety-guard`, and `superpowers`. |

## Candidate disposition matrix

| Candidate | Live facts observed this run | Retirement pressure | Residual / dependency that blocks autonomous retirement | Proposed operator decision |
|---|---|---|---|---|
| `token-budget-advisor` | Tier-2 skill only; no slash command; presents a 25/50/75/100% pre-answer menu when users mention response length or token budget. | High. Modern agent settings and direct user instructions can usually handle answer depth without a blocking menu. The menu also conflicts with the "act, don't ask" bias for simple requests. | Low technical coupling: catalog/readme/count surfaces and generated mirror still need a deliberate cascade; user-facing behavior changes if someone relies on the explicit menu. | Strongest retirement candidate. If owner/Fatin agrees, remove it in a dedicated PR or first slim it to a short "honor explicit depth requests" note; verify skill counts, mirrors, docs, and generated artifacts. |
| `strategic-compact` | Tier-2 skill only; no slash command. Follow-up cleanup corrected the old missing-script claim: the skill now describes a manual phase-boundary checklist and explicitly says the plugin does not ship a `strategic-compact` PreToolUse hook or threshold script. | Medium as a remaining human compaction reminder; the runtime-hook overclaim is closed. Native `/compact`, host auto-compaction, and model discipline cover much of the original need. | Before retirement, decide whether phase-boundary compaction guidance belongs in `handoff`, `verification-loop`, or a shorter operator note. | Do not delete silently. Further slimming/retirement needs an owner/Fatin decision and the full generated mirror/count/doc verification cascade. |
| `safety-guard` | Tier-2 skill only; no slash command. It self-admits enforcement is skill-side discipline only and has no bundled tool-call gate. Docs still reference it for trusted `dangerously-skip-permissions` / autonomous sessions. | Medium. Native permission prompts, sandboxing, path-scoped host rules, and `gateguard`/`reconcile` cover many hazards better than honor-system prose. | Product docs currently use it as the explicit safety story for high-risk autonomous modes. Removing it without a replacement would weaken operator guidance. | Keep pending a separate decision: either build a real runtime gate in a dedicated feature, or slim the skill/docs to a warning-only checklist and stop calling it a runtime guard. |
| `handoff` | Tier-2 skill plus `/handoff` command; writes an `mktemp` markdown brief for cold continuation and tells the next session which skills to load. | Low-to-medium. Native `--resume`, `--continue`, and memory reduce same-harness handoff need. | Cross-harness, cross-profile, scheduled-job, and out-of-band artifacts remain real needs; repo docs and generated command surfaces reference it. | Keep as STILL-EARNING for now. Revisit only when native resume/memory reliably transfers across Claude Code, Hermes/OpenClaw-class harnesses, and scheduled/out-of-band sessions. |
| `superpowers` | Companion skill plus `/superpowers` command; large dispatcher with routing tables, stacked-PR precondition, companion-preference override, runtime hook, telemetry, and doc-substring locks. | Medium as a dispatcher: native skill auto-invocation covers some routing. | High residual coupling: stacked-PR precondition, `hooks/companion-preference.mts`, telemetry, `check-docs-substrings`, optional companion docs, and routing-target tests all depend on this surface. | Do not retire now. First split durable governance (`stacked-PR` and companion-preference telemetry) into invariant homes; only then consider slimming the dispatcher table. |
| `para-memory-files` | Absent from current `skills/` and `commands/`; historical references remain in audit/report logs. | Already handled. | Historical docs should remain as history, not active work. | No action. Future model-forward audits should mark this candidate as already retired instead of counting it as live. |

## Recommended decision order

1. **Operator/Fatin policy decision first:** approve or reject retirement/slimming for `token-budget-advisor`, the cleanest remaining candidate.
2. **Closed safe cleanup:** the `strategic-compact` source skill's stale `suggest-compact.js` hook setup claim has been corrected without changing runtime behavior.
3. **Do not delete `safety-guard` yet:** decide whether the product wants a real runtime gate or a warning-only checklist.
4. **Keep `handoff` unless cross-harness handoff is proven obsolete.** It still supports scheduled/out-of-band continuity that native same-harness resume does not fully cover.
5. **Keep `superpowers` until residual governance is relocated.** Treat any retirement as a stacked plan, not a cron-job cleanup.

## Approval and verification requirements for any future retirement PR

A future retirement/slimming PR must be one candidate at a time and must include:

- source skill/command deletion or slimming only for the approved candidate;
- regenerated plugin mirror/artifacts from `npm run build`;
- explicit updates to `README.md`, `skills/README.md`, `docs/skills.md`, `CONTRIBUTING.md`, `llms.txt`, generated plugin manifests, and any command references that name the skill;
- targeted tests for count/tier/doc-substring/routing behavior where applicable;
- `npm run verify:all` and, if `.mts` sources changed, `npm run build` immediately before staging;
- no release tag, publish, deploy, cron, secret, env, or third-party snapshot change in the same PR.

## Non-goals

- No skill is retired by this note.
- The follow-up changes only source/generated skill documentation and catalog/tracking docs; no generated `.mjs`, manifest, or package metadata file is changed.
- No runtime hook, MCP schema, tool behavior, installation mode, release workflow, or cron job is changed by this note.
- Native capability claims here are an operator proposal, not proof from live Claude Code release notes; the implementation PR should re-check the exact host behavior before deleting a user-visible skill.
