# insights-claude-md.md — paste-in CLAUDE.md blocks

The four blocks below originate from the 28-day Claude Code usage report (`usage-data/report.html`, "Suggested CLAUDE.md Additions" section). Each block targets a recurring friction class the report flagged:

- **Verification Discipline** — sessions where typecheck/test was skipped or run from the wrong CWD
- **Environment Notes** — Windows + Git Bash + PowerShell mismatches that cost retries
- **Think Before Acting** — sessions where edits started before grounding was complete
- **Git & Deploy Workflow** — merge declared "done" while the deploy provider was still on a stale commit

The discipline behavior is already encoded as continuous-improvement skills (`gateguard`, `workspace-surface-audit`, `verification-loop`, `deploy-receipt`). These blocks are the *project-local* CLAUDE.md text — the per-repo reminder that lives where developers actually look when they read `CLAUDE.md`. Skills enforce; CLAUDE.md communicates.

## How to use this file

1. Open the target project's `CLAUDE.md`.
2. Pick the blocks that apply to that project (TypeScript projects probably want all four; library-only projects can skip the deploy block).
3. Paste them under existing sections or as new top-level sections.
4. Adjust placeholders — the report's wording is opinionated. `pnpm` is just an example; if the project uses `npm` or `yarn` or `bun`, swap it. If the project's deploy target is not Railway or Cloudflare, swap those names. The structure stays; the specifics adapt.
5. Optionally lock the section headings under `bin/check-docs-substrings.mjs` so a wholesale CLAUDE.md rewrite doesn't silently drop the discipline contract.

The blocks are paste-in markdown — copy them verbatim into your project's CLAUDE.md.

---

## Block 1 — Verification Discipline

Paste under a "Working norms" or "Coding standards" section. Adjust `pnpm` → your package manager.

```markdown
## Verification Discipline
- Always run `pnpm typecheck` and `pnpm test` after code changes before declaring done
- Run verification commands from the repo root; verify CWD with `pwd` if a previous command may have changed it
- Never claim 'verified' or 'done' without showing the passing output
```

Why this block: the report flagged sessions where Claude either skipped typecheck/test until the operator prompted, or ran `tsc` from `frontend/` and incorrectly concluded deps weren't installed. The CWD line addresses the second failure mode directly.

## Block 2 — Environment Notes

Paste under a "Local development" or "Environment" section. Adjust the shell + tool list to match the project's actual setup.

```markdown
## Environment Notes
- Shell is Git Bash on Windows; do NOT use `jq` (not installed) — use PowerShell or node/python for JSON parsing
- Be careful with bash quoting in curl/psql commands; prefer heredocs or files over inline single-quoted JSON
- CLAUDE.md is case-sensitive on some filesystems — always use uppercase
```

Why this block: the report flagged repeated jq-not-installed retries, shell-quoting failures on curl/psql, and a Windows case-sensitivity issue with `CLAUDE.md` vs `claude.md`. If your environment is different (macOS + zsh, Linux + bash, WSL2), rewrite this block to name *your* environment's grain — the goal is to surface the per-project gotchas before the agent re-discovers them at a cost of one wasted retry each.

## Block 3 — Think Before Acting

Paste near the top of CLAUDE.md, ideally above any task-specific instructions.

```markdown
## Think Before Acting
- For any non-trivial request, produce a short plan before editing files
- When the user references prior work (e.g. 'the Finnhub stuff'), verify it exists in the repo before acting on the assumption
- Use TDD for new features: write failing test, then code, then verify
```

Why this block: the operator literally had to type "you need to think before u response" mid-session, and a separate session was wasted verifying nonexistent "Finnhub work" that was only used as a framework analogy. The first bullet generalizes the "plan first" rule from the global CLAUDE.md; the second is project-local — if your project has its own analogy-vs-real-code traps, name them here.

## Block 4 — Git & Deploy Workflow

Paste under a "Git workflow" or "Release process" section. Adjust the deploy provider names to match your project.

```markdown
## Git & Deploy Workflow
- Never push directly to main — use PR workflow; harness will block direct pushes
- After merging, verify Railway/Cloudflare actually picked up the commit before declaring deploy complete
- For production POSTs and wrangler tail, expect harness blocks and surface them as caveats requiring user action
```

Why this block: multiple sessions hit "Railway deploy didn't pick up the latest commit" or "harness blocked merge-to-main / production POST / wrangler" — pre-emptive awareness saves retry cycles. The second bullet is what `deploy-receipt` enforces in-tooling; this CLAUDE.md text makes the same expectation visible to humans reviewing PRs.

If your project deploys somewhere other than Railway or Cloudflare, swap those names. If your project does NOT auto-deploy from main (library-only / package-published), drop the second bullet entirely — receipt verification doesn't apply.

---

## Companion skills (already installed if you have continuous-improvement)

Each block has a corresponding skill that enforces the rule when an agent is in the loop. Pasting the block tells humans the rule; installing the skill makes the agent obey it.

| Block | Companion skill |
|---|---|
| Verification Discipline | `verification-loop` (per-project ladder via `.claude/verify-ladder.json`) |
| Environment Notes | `workspace-surface-audit` (records environment grain at session start) |
| Think Before Acting | `gateguard` (blocks Edit/Write/Bash before grounding) |
| Git & Deploy Workflow | `deploy-receipt` (verifies deployed SHA + healthcheck before declaring done) |

If you want both layers (CLAUDE.md text + skill enforcement), paste the block AND keep the skill installed. If you only want one, the skill is the higher-fidelity surface — it runs at the tool boundary and cannot be skipped by an agent that didn't read the markdown.
