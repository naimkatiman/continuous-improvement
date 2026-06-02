# `scripts/` — deterministic primitives skills cite

This directory holds small, hand-authored scripts that skills (and hooks) cite instead of restating fixed operations inline. The motivation is the skills audit's "deterministic vs non-deterministic" axis: when a step inside a skill is the same operation every time (a fixed git command, a regex parse, a path lookup), it does not belong in the LLM-driven part of the skill — it belongs here, where the script runs the same way every invocation, costs no tokens, and stays in one place so multiple skills can share it.

## Conventions

- **Hand-authored, no `.mts` source.** Files in `scripts/` are not part of the `tsc` build pipeline (see [`CLAUDE.md`](../CLAUDE.md) → "Build pipeline"). The pipeline owns `bin/`, `lib/`, `test/`. `scripts/` is the bare-metal home for shell scripts and one-off Node utilities skills cite directly.
- **One concern per script.** Each script does one thing and prints either machine-readable output (JSON envelope, single value) or a stable fenced block. Skills consume the output; they do not re-derive it.
- **Cross-platform shape.** Bash scripts run via Git Bash on Windows, native bash on macOS/Linux. Tests for bash scripts skip when bash is not on PATH (see `src/test/hook.test.mts` for the established skip pattern).
- **Cite from skills.** When a skill needs a primitive, the skill body cites the script path (`scripts/<name>.<ext>`) and quotes the expected output shape once. The skill does not restate the script's inner mechanics.

## Inventory

| Script | Purpose | Cited by |
|---|---|---|
| `git-state-snapshot.sh` | JSON envelope `{head, upstream, dirty, root, branch}` for the current git working tree | `skills/gateguard.md` (Parallel-Actor Gate), `skills/worktree-safety.md` (Root + branch), `skills/workspace-surface-audit.md` (Environment Grain — parallel-actor row), `skills/reconcile.md` (Detect a Concurrent Writer) |
| `detect-deploy-target.sh` | Detect the auto-deploy provider for the repo at the current working directory (or first arg). Prints one of `railway`/`cloudflare`/`vercel`/`netlify`/`fly`/`appengine`/`apprunner`/`gha-deploy`/`none`. Always exits 0. | `skills/verification-loop.md` (Phase 8 deploy-receipt handoff), `skills/deploy-receipt.md` (When to Activate gate) |
| `get-deployed-sha.sh` | Per-provider deployed-SHA extraction. Default mode runs the CLI; `--show-command <provider>` prints the pipeline shape without executing (useful for citation, dry-run, tests). | `skills/verification-loop.md` (Phase 8), `skills/deploy-receipt.md` (Route A — provider CLI extraction) |
| `resolve-verify-ladder.mjs` | Resolve the per-project verification ladder for Phase 0 of `verification-loop`. Encodes the four-step priority — manifest > package.json sniff > per-language toolchain > ask-operator. Default mode prints the fenced block the skill displays; `--json` mode emits a JSON object for machine consumption. | `skills/verification-loop.md` (Phase 0) |
| `scan-past-mistakes.mjs` | Scan the three Past-Mistake Acknowledgment Gate surfaces — `~/.claude/instincts/<hash>/observations.jsonl` (last N failure/correction rows), `~/.claude/projects/<hash>/memory/feedback_*.md`, and `<root>/CLAUDE.md` "## Past Mistakes" table. Active-in-scope judgment is the LLM's job; the script provides quotes + citations only. | `skills/proceed-with-the-recommendation.md` (Phase 0 Rule 1) |
| `route-recommendation.mjs` + `route-recommendation.routes.json` | Match a recommendation item to its preferred-skill chain + inline fallback from the Phase 3 routing table (29 rows). Data file is the programmatic source of truth; the skill's table is documentation that mirrors it. Default mode prints a match block; `--json` for machine consumption; `--list` enumerates all rows. | `skills/proceed-with-the-recommendation.md` (Phase 3 routing table) |
| `run-synthetic.mjs` | Phase 9 runner: invoke every `*.synthetic.{sh,mjs,ts,py}` in `synthetic-checks/`, inject `BASE_URL`/`BASELINE_URL`/`EXPECTED_SHA`/`DEPLOY_BRANCH`/`RECEIPT_TIMESTAMP` (unset vars pass through as `""`), capture stdout/stderr/exit per check, aggregate. Default mode prints the report block; `--json` for machine consumption; `--fail-fast` halts on first drift or timeout; `--timeout <sec>` per-check wall-clock cap; `--show-command` dry-run. Exit 0 all-pass, 1 drift, 2 config error, 3 usage. | `skills/verification-loop.md` (Phase 9 — production-vs-baseline diff) |

When a new script lands here, add a row to this table in the same PR and cite the script from at least one skill — otherwise the script is dead code on arrival.

## Relationship to other locations

- `bin/` — generated CLI entrypoints (`.mjs` from `src/bin/*.mts`). Do not hand-edit; see [`CLAUDE.md`](../CLAUDE.md) → "Build pipeline".
- `lib/` — generated library code (`.mjs` from `src/lib/*.mts`). Same rule.
- `hooks/` — generated PreToolUse / PostToolUse / Stop hooks (`.mjs` from `src/hooks/*.mts`). Wired in `plugins/continuous-improvement/hooks/hooks.json`.
- `scripts/` — this directory. Hand-authored primitives skills cite.

When deciding where a new piece of code belongs: if it implements a runtime hook the harness will call, it goes in `src/hooks/`. If it's a verification or CLI entrypoint the plugin or `npm run` invokes, it goes in `src/bin/`. If it's reusable logic shared between those, it goes in `src/lib/`. If it's a small primitive a skill body cites by path (and the operator or harness runs ad hoc), it goes here.
