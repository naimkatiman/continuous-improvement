# 2026-06-10 — First model-forward audit of the 26 bundled skills

First exercise of the `model-forward` skill (PR #229) on the repo itself: every bundled skill classified against the stance's Decision Rules — does it encode one of the two durable invariants (goal-driven execution, self-discipline guardrails), or is it scaffolding a current-generation model/harness no longer needs?

Run by a read-only audit subagent on main at v3.13.0; all 26 skills read in full; runtime hooks verified on disk. **Nothing in this document is a deletion — every RETIREMENT-CANDIDATE is a proposal to the operator, per the stance.**

## Verdict counts

| Bucket | Count |
|---|---|
| INVARIANT — keep indefinitely | 6 |
| STILL-EARNING — real gap today, recheck next audit | 14 |
| RETIREMENT-CANDIDATE — native capability covers ≥80% | 6 |

## INVARIANT (6)

| Skill | Why it survives every model generation |
|---|---|
| `SKILL.md` (root, 7 Laws) | The Laws ARE the two invariants (goal-driven execution = Laws 2/3/4/6; guardrails = 1/4/5/7). |
| `model-forward` | The audit stance itself — encodes propose-don't-delete; self-referentially the last skill that could merge away. |
| `proceed-with-the-recommendation` | Goal-driven orchestrator: ordered walk, per-item non-transitive verification, needs-approval halts; runtime layer in `hooks/three-section-close.mjs`. |
| `goal-monitor` | Scores actual tool activity against the stated goal via `hooks/goal-drift-stop.mjs`; native task tracking does not score drift. |
| `gateguard` | Live PreToolUse fact-forcing gate in `hooks/gateguard.mjs`; no native equivalent; measured +2.25 uplift. |
| `verification-loop` | Outcome/completeness gate beyond native `/verify` behavioral spot-checks. |

## STILL-EARNING (14)

`tdd-workflow` (slim the tutorial body — the tests-BEFORE-code enforcement kernel is the value), `ralph`, `grill-me`, `grill-with-docs`, `recovery-classification`, `state-reconciliation`, `worktree-safety` (recheck as native worktree tooling grows), `wild-risa-balance`, `workspace-surface-audit`, `deploy-receipt` (future audit may fold into verification-loop as a Phase 8), `recall`, `skill-distillation`, `audit`, `reconcile`.

Common shape: each covers a gap the native harness still has (interview-style spec extraction, failure-class taxonomies, parallel-writer git reconciliation, episodic search over tool history). None should be retired on assumption; several should be slimmed.

## RETIREMENT-CANDIDATE (6) — proposals only

| Skill | Native capability that covers ≥80% | Residual to relocate before retiring |
|---|---|---|
| `strategic-compact` | Native auto-compact/microcompact + `/compact` with custom instructions; the skill's premise describes the 2025 harness | — |
| `handoff` | Native `--resume`/`--continue` + auto-memory | Cross-harness (Claude→Codex/Maulana) handoff — if load-bearing, downgrade to STILL-EARNING |
| `para-memory-files` | Native auto-memory (`MEMORY.md` + topic files, auto-loaded) — demonstrably what this host actually uses; PARA is a parallel system fighting the native one | Tier-1 table + count cascade on removal |
| `token-budget-advisor` | Default instruction-following on depth + output styles; the pre-answer menu is a blocking question the stance counsels against | — |
| `safety-guard` | Native permission system (path-scoped rules, ask-prompts, sandboxed Bash, host-level gating); skill self-admits honor-system prose | — |
| `superpowers` (dispatcher) | Native Skill-tool description-based auto-invocation performs the routing the four-source tables hand-hold | Stacked-PR precondition + `hooks/companion-preference.mjs` need a new home first |

## The rubric (for the scheduled scaffold-retirement reviewer)

1. Does the release-notes diff name a native feature whose description overlaps this skill's triggers? No overlap → stop.
2. Walk the skill's behaviors section-by-section: native covers ≥80% of them, not just the headline? Below 80% → STILL-EARNING.
3. Invariant test: strip the mechanics — does a residual encode goal-driven execution or a guardrail? If yes, propose slimming to the kernel, never full retirement.
4. Runtime-enforcement test: does the skill ship a live hook/script the native feature does not replace? Uncovered enforcement blocks retirement.
5. Model-weakness test: confirm the current model still exhibits the weakness being patched — don't patch yesterday's model, don't retire on assumption either.
6. Dependency sweep: grep routing tables, hooks, CLAUDE.md, verify:* invariants, "Pairs With" sections; the proposal lists every dependent surface.
7. Host-reality check: is the operator already using the native substitute in practice? Active parallel use is the strongest retirement evidence.
8. Output is a proposal naming the native substitute + migration list; nothing is deleted — operator authority per `model-forward`.

## Caveats

- Native-capability claims rest on what is observable in this environment plus training knowledge of mid-2026 features, not an actual release-notes diff; `strategic-compact` is the least independently verified candidate.
- Retirement proposals for `para-memory-files`/`tdd-workflow` carry doc-cascade cost (tier tables, count invariants, llms.txt) per the verify:all chain.
- `verification-loop` vs `deploy-receipt` bucket split is a boundary judgment: both are Law-4; split on invariant-core vs mechanics-recipe.
