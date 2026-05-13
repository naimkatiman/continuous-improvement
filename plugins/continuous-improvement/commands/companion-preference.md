---
name: companion-preference
description: Inspect companion-preference hook telemetry — counts by CI skill, action breakdown, and companion-installed%.
---

# /companion-preference

Read and aggregate the JSONL telemetry written by `hooks/companion-preference.mjs`. Reports per-skill totals, action breakdown (`observation`, `advisory`, `block`, `block-not-installed`), and the share of events where the companion plugin was installed at the time.

The dataset is the evidence base for a future `companions-first` default-flip decision — once a 7-day shadow shows the `companions-first` path firing on a meaningful share of routed Skill calls, with companions installed in the majority of them, the flip is grounded.

## Trigger phrases

- `/companion-preference`
- `/companion-preference status`
- "show companion preference stats"
- "what does the companion-preference hook see"

## What happens

1. Run `node bin/companion-preference-status.mjs` from the repo root with the operator's chosen window. Default `--days 7`. Pass `--all` for the entire file or `--days N` for a different window.
2. Render the table the CLI emits to the user verbatim. Do not paraphrase the numbers — the JSONL is authoritative.
3. If the CLI prints "no telemetry recorded yet," check three things in order: (a) `~/.claude/settings.json` has `continuous_improvement.companion_preference` set (otherwise the hook is a no-op and writes nothing); (b) the user has invoked at least one mapped CI skill (`tdd-workflow`, `verification-loop`, `context-budget`, `ralph`, `learn-eval`) since the hook landed; (c) the hook's PreToolUse registration is intact in `plugins/continuous-improvement/hooks/hooks.json`.
4. Offer one decision-ready next step based on the totals — e.g., "ratio of `observation` rows with `companion_installed=true` suggests `companions-first` is safe to flip for X but not Y."

## Subcommands

### `/companion-preference status` (default)

Same as `/companion-preference`.

### `/companion-preference status --json`

Emit the machine-readable JSON report. Useful when you want to pipe the output into another tool or write your own aggregator.

```bash
node bin/companion-preference-status.mjs --json --all
```

## CLI flags

| Flag | Effect |
|---|---|
| `--days N` | Only count events from the last N days (default 7). |
| `--all` | Ignore the window; count every row in the file. |
| `--json` | Emit a machine-readable JSON report. |
| `--path <file>` | Override the default JSONL path. Used by the test suite; rarely needed in practice. |
| `-h`, `--help` | Print CLI help and exit. |

## Path resolution

By default the CLI reads `~/.claude/instincts/<project-hash>/companion-preference.jsonl`, where the hash is the same `sha256(projectRoot).slice(0, 12)` that the hook itself uses. The project root resolves via `CLAUDE_PROJECT_DIR` env var if set, else `git rev-parse --show-toplevel`, else the literal `"global"`. Hash and path scheme are reused verbatim from `hooks/companion-preference.mjs` to keep the read side aligned with the write side.

## Companion skills

- `hooks/companion-preference.mjs` — the writer that produces the JSONL this command reads.
- `skills/superpowers.md` § "Companion-Preference Override" — the broader contract for the setting this command's dataset measures.
- `commands/dashboard.md` — the broader continuous-improvement status surface; this command is the dispatcher-bias-specific narrower view.
