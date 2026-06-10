# Plan — model-forward default skill

Date: 2026-06-10
Branch: `feat/model-forward-skill`
Status: complete (verified 2026-06-10)

## Goal

Ship the operator's standing mental model as a bundled tier-1 (default-install) skill:

1. **Go with Claude, not against it** — default to Claude Code native best practices and capabilities until the user says otherwise.
2. **Skills are scaffolding** — models improve continuously; skill mechanics merge into the model over time. The durable core is the two invariants: goal-driven execution (the higher the stated goal, the better) and self-discipline/guardrails (the 7 Laws).
3. **Harness-portable state** — agents beyond Claude Code that import continuous-improvement (Hermes/OpenClaw-class harnesses) adopt the same mental model.

## Assumptions

- "Default skill" = tier `"1"` in this repo's taxonomy (beginner-mode default install).
- Law tag: `all 7 Laws` — the stance spans the framework; `check-skill-law-tag` accepts the tag.
- "Include in the state" = a Harness Portability section in the skill body + host auto-memory entry. No code changes to external harnesses from this repo.
- Pure prompt skill: no lib, no hook, no MCP tool. Generator auto-discovers it; no generator edit needed.

## Files

| File | Change |
|---|---|
| `skills/model-forward.md` | NEW — source skill, tier "1", law tag `all 7 Laws` |
| `commands/model-forward.md` | NEW — `/model-forward` command card |
| `skills/README.md` | Add row to Tier 1 table |
| `package.json` | 25 → 26 bundled skills |
| `llms.txt` | 25 → 26 bundled skills |
| `src/lib/plugin-metadata.mts` | 25 → 26 bundled skills |
| `.cloudplugin/marketplace.json` | 25 → 26 bundled skills (hand-maintained, not generator-owned) |
| generated | `npm run build` regenerates `lib/plugin-metadata.mjs`, `.claude-plugin/marketplace.json`, `plugins/continuous-improvement/**` mirror |

## Verification

1. `npm run build` then `npm run verify:all` (13 invariants incl. skill-mirror, skill-tiers, skill-law-tag, skill-count, typecheck).
2. `npm run verify:generated` parity.
3. code-reviewer pass on the diff before PR.
4. Stage by explicit filename (autocrlf discipline), feature branch + PR, never direct push to main.

## Out of scope (deferred, logged here)

- Wiring the model-forward stance into the `superpowers` dispatcher routing table — the skill is a stance card, not a routing target; revisit only if routing demand appears.
- Any edits to Hermes/OpenClaw harnesses themselves — they import this skill; this repo does not reach into them.
- Extending `CHECKED_FILES` in `src/bin/check-skill-count.mts` to cover `docs/landing/index.html` — code-review found the landing stat block escapes the skill-count invariant (stale "25" fixed by hand in this PR). The checker extension is a tooling change and ships alone per the no-bundled-concerns rule.
- Tier-1 table ordering divergence between hand-authored `skills/README.md` and the alphabetized generated mirror (incl. `deploy-receipt`/`recall` missing from the hand table) — predates this change.
