# Node Observer + Rich Schema + 22k Backfill

- Date: 2026-05-05
- Branch: `feat/node-observer-rich-schema`
- Author: Naim
- Slug: `node-observer-rich-schema`

## Goal

Replace `hooks/observe.sh` with a Node observer that captures the rich event schema (`tool_input.command` for Bash, `Edit.file_path` for Edit/Write, truncated `tool_output`, success flag) without requiring `jq` on `PATH`. Ship a `npx continuous-improvement backfill` subcommand that re-reads existing thin-schema `observations.jsonl` rows and re-emits them through the new observer's parser so the auto-instinct pipeline finally has the data it needs to detect patterns.

## Why this matters (live evidence)

On a `jq`-less host, captured 22,065 observations across 11 projects since 2026-04-27. Auto-detected pattern instincts: 0. The two instincts present (`skip-thin-observation-schema`, `parallelize-independent-tool-calls`) are manual reflections, not output of the analysis pass. Root cause traced to [hooks/observe.sh:30-38](../../hooks/observe.sh#L30-L38) — the bash fallback drops every field except `ts/event/session/tool/project_id/project_name`, so the analysis pass cannot detect "user corrections" or "error→fix sequences" that Law 7 promises. The first thin-row of evidence, `skip-thin-observation-schema`, named this gap on 2026-04-29 at confidence 0.6 — it never got closed.

## Non-goals (YAGNI)

- No new runtime dependencies. Continue zero-dep at runtime (Node built-ins only).
- No replacement of the SessionStart/SessionEnd `session.sh` hook — out of scope for this PR; it does the same thin-schema thing but only fires twice per session, much smaller cost.
- No new analysis or pattern-detection algorithm. This PR delivers the *data*; the existing `/continuous-improvement analyze` consumer keeps reading `observations.jsonl` as before, just with richer rows.
- No bash → PowerShell port of `observe.sh`. The bash file becomes a thin shim that exec's `node`; Windows operators with Git Bash continue to work as before, plus they no longer need `jq`.
- No transcript content beyond what the bash version already attempted to capture (first 500 chars of `tool_input`, first 200 chars of `tool_output`). Same privacy budget.
- No structural change to `observations.jsonl` filename or per-project hash directory layout. Existing on-disk schema (one JSONL line per event) preserved so existing consumers keep working.
- No changes to existing instincts, packs, or skills. Pure infrastructure.

## Approach (recommended, vs. alternatives)

Three approaches considered:

- **A. Node observer reads stdin via `readFileSync(0, "utf8")`, parses with `JSON.parse`, writes JSONL line via `appendFileSync`. `hooks/observe.sh` becomes a 2-line shim: `node "$NODE_OBSERVER_PATH" "$@"` with stdin passthrough.** Zero new deps, no jq, no install-time PATH discovery. **CHOSEN.**
- B. Pure-bash rewrite using `sed`/`awk` to extract `tool_input.command` and `tool_input.file_path` without jq. Doable but fragile — JSON nesting + escaped quotes in command bodies require a real parser. Punt.
- C. Use Node `child_process` to spawn jq if present and fall through to native parsing if not. Adds a fork per event, no benefit over native parsing. Reject.

Trade-off accepted: the bash → node hop adds ~30–50ms per tool call on Windows (process spawn cost). Hook budget per CONTRIBUTING.md is "<200ms on Unix; <500ms in tests on Windows". Measured via `hook-stats.mjs` on this host: bash observe.sh fallback path averages ~12ms; Node observer expected at ~40–80ms cold, ~25–40ms warm. Budget headroom is ample.

## Tracks and tasks

### Track A — Node observer (5 tasks)

A1. **Create `src/lib/observe-event.mts`** — pure functions: `parseHookPayload(raw: string): HookEvent | null`, `summariseInput(toolName: string, input: unknown): string`, `summariseOutput(output: unknown): string`. Truncation budget: input 500 chars, output 200 chars (preserve current behavior). Tool-specific extraction: for `Bash`, capture `command` head; for `Edit`/`Write`, capture `file_path`; for `Read`/`Grep`/`Glob`, capture target/pattern; default to first-200-chars-of-stringified-input. **No I/O — pure data shaping.**

A2. **Create `src/bin/observe.mts`** — entrypoint. Reads stdin via `readFileSync(0, "utf8")`, computes `PROJECT_ROOT` (env `CLAUDE_PROJECT_DIR` → `git rev-parse --show-toplevel` via `execSync` → `"global"`), computes `PROJECT_HASH` (sha256, first 12), ensures `~/.claude/instincts/<hash>/` dir exists, rotates `observations.jsonl` at 10,000 lines (preserve existing behavior), appends one rich JSONL line. Always exits 0; catches every error to stderr without throwing.

A3. **Replace `hooks/observe.sh`** — content becomes a thin 5-line bash shim that `exec node "$(dirname "${BASH_SOURCE[0]}")/../bin/observe.mjs" 2>/dev/null` and exits with the node exit code. Preserves install path: `install.mts` keeps registering `bash "$observePath"` on operator settings.json, no operator re-registration required.

A4. **Tests in `src/test/observe.test.mts`** — fixtures for Bash command, Edit file_path, Read pattern, malformed JSON (must not crash), empty stdin (must exit 0), 10,000-line rotation (must rename old file with timestamp, keep last 10 archives). Performance assertion: parse + write must complete in <50ms per fixture.

A5. **Update `bin/check-everything-mirror.mjs`** — `bin/observe.mjs` (compiled) joins the mirrored set; the bash shim stays at `hooks/observe.sh`.

### Track B — Backfill subcommand (4 tasks)

B1. **Create `src/bin/backfill.mts`** — new entrypoint. Reads `~/.claude/instincts/<hash>/observations.jsonl`, detects "thin schema" rows (rows missing `input_summary` or with empty `input_summary`), prompts the operator with line count + estimated time, then for each thin row attempts to recover the input from any companion field. Honest fallback: thin rows have no captured input — backfill cannot fabricate it. The realistic deliverable is a *flag pass*: tag each thin row with `{schema: "thin"}` and emit a separate `summary.json` with thin-vs-rich line counts per project so analysis consumers can skip thin rows cleanly.

B2. **CLI wiring in `src/bin/install.mts`** — register `npx continuous-improvement backfill` as a new subcommand alongside `install` / `--uninstall`. Help text + post-run summary.

B3. **Tests in `src/test/backfill.test.mts`** — fixtures: pure-thin file (every row gets tagged), pure-rich file (no-op, exits 0), mixed file (only thin rows tagged, rich preserved), corrupt rows (skip, do not crash, log to stderr).

B4. **Documentation** — README "Operator modes" section gets a backfill row. CHANGELOG `Known Issues` block updates: "auto-instinct gap closed in <version>; pre-existing observations remain thin and are tagged for skipping."

### Track C — Plumbing (3 tasks)

C1. **`package.json` `bin` field** — add `"continuous-improvement-observe": "bin/observe.mjs"` so the npm install path is reachable. Reuses the existing `continuous-improvement` entry for `backfill` (subcommand).

C2. **`tsconfig.json`** — add `src/bin/observe.mts` and `src/bin/backfill.mts` to compilation. Build emits `bin/observe.mjs` and `bin/backfill.mjs`.

C3. **CHANGELOG `[Unreleased]` entry** — under `Added`: Node observer + backfill subcommand. Under `Changed`: `hooks/observe.sh` reduced to a node-shim. Under `Removed`: jq dependency.

## Verification

After every task completes:

- `npm run verify:all` — all 6 lints + typecheck green
- `npm test` — 414+ pass (no regressions; new tests add ~15–25 cases)
- `node bin/observe.mjs < test/fixtures/sample-bash.json` — manual smoke; rich row appears in `~/.claude/instincts/<hash>/observations.jsonl` with `input_summary` populated
- `node bin/backfill.mjs --project <hash>` — manual smoke against this very repo's hash (`0af156594b39`); confirms 5,452 thin rows tagged, 0 rich rows touched
- `bash hooks/observe.sh < test/fixtures/sample-bash.json` — confirms the shim still works on Windows Git Bash with the same exit code as the direct node call
- `npm run hooks:stats` (existing) — confirms the new observer's wall-clock stays under budget

## Commit shape

Per CLAUDE.md "phased features ship as one commit per layer", the PR ships as 5–7 commits:

1. `feat(lib): add observe-event pure parsers` (Track A1)
2. `feat(bin): add observe Node entrypoint replacing bash` (Track A2 + A3 + A5 + plumbing C1/C2)
3. `test(observe): cover parse/write/rotate/error paths` (Track A4)
4. `feat(bin): add backfill subcommand for thin-schema rows` (Track B1 + B2)
5. `test(backfill): cover thin/rich/mixed/corrupt fixtures` (Track B3)
6. `docs: surface observer + backfill in README and CHANGELOG` (Track B4 + C3)

Each commit ≤15 hand-edited source files, each verifiable in isolation.

## Risks and mitigations

- **R1 — Windows process spawn overhead breaks <500ms test budget.** Mitigation: profile in CI (job `test (22)` is the slowest); if Windows spawns exceed budget, switch the hook from `bash → exec node` to a single direct node hook command in `install.mts` (skip the bash hop entirely on Windows, register `node "$observePath"` instead).
- **R2 — Existing operators keep using the bash fallback because `install.mts` registered `bash "$observePath"` and the path on disk still says `observe.sh`.** Mitigation: shim approach preserves the registered command; upgrade is automatic on next `npx continuous-improvement install --mode expert` re-run, and operators who do not re-run are no worse off than today (still thin schema, same behavior).
- **R3 — `JSON.parse` rejects malformed payloads that Claude Code sends with embedded NULL bytes or invalid UTF-8.** Mitigation: wrap `JSON.parse` in try/catch, log to stderr, exit 0 (preserve the "never block the session" contract).
- **R4 — Backfill is destructive if it rewrites in place.** Mitigation: backfill writes to `observations.jsonl.tagged` first, then atomic-renames over the original; original kept as `observations.jsonl.bak` for one rotation cycle.

## Out of scope (carry to follow-up PRs)

- Pattern-detection algorithm improvements that exploit the rich schema (RISA-3 in the audit list — `lint-transcript.mjs` schema-incomplete detection — touches the same code path, but is its own PR).
- `session.sh` hook port (low call rate, low priority).
- Observation rotation policy changes (RISA-4, separate PR).
- `doctor` health-check command (RISA-5, separate PR — depends on this PR landing because it queries the rich-schema fields the observer produces).
