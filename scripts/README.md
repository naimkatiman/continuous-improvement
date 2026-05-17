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
| `git-state-snapshot.sh` | JSON envelope `{head, upstream, dirty, root, branch}` for the current git working tree | `skills/gateguard.md` (Parallel-Actor Gate), `skills/worktree-safety.md` (Root + branch), `skills/workspace-surface-audit.md` (Environment Grain — parallel-actor row) |

When a new script lands here, add a row to this table in the same PR and cite the script from at least one skill — otherwise the script is dead code on arrival.

## Relationship to other locations

- `bin/` — generated CLI entrypoints (`.mjs` from `src/bin/*.mts`). Do not hand-edit; see [`CLAUDE.md`](../CLAUDE.md) → "Build pipeline".
- `lib/` — generated library code (`.mjs` from `src/lib/*.mts`). Same rule.
- `hooks/` — generated PreToolUse / PostToolUse / Stop hooks (`.mjs` from `src/hooks/*.mts`). Wired in `plugins/continuous-improvement/hooks/hooks.json`.
- `scripts/` — this directory. Hand-authored primitives skills cite.

When deciding where a new piece of code belongs: if it implements a runtime hook the harness will call, it goes in `src/hooks/`. If it's a verification or CLI entrypoint the plugin or `npm run` invokes, it goes in `src/bin/`. If it's reusable logic shared between those, it goes in `src/lib/`. If it's a small primitive a skill body cites by path (and the operator or harness runs ad hoc), it goes here.
