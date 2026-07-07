# Typecheck Stop gate (RISA 4 / G4)

Date: 2026-07-07
Branch: `feat/typecheck-stop-gate` (off `main` @ 83a0e5c, after v3.18.0)
Driver: `/insights` survey gap G4 (PARTIAL). The global Stop hook `~/.claude/scripts/typecheck-changed.sh` runs `tsc` on changed TS files but emits a human-only `systemMessage` — its output never re-enters model context, so a headless/autonomous `-p` loop never sees or fixes its own type errors. Verifier corrected the original premise: Stop hooks DO fire in `-p` runs; the real hole is that the failure is advisory, not a `{"decision":"block"}` that re-prompts the model.

## Goal

Ship a plugin Stop hook that runs the project typecheck on changed TS files and, when opted in, returns a block decision so the failure re-enters model context and the agent fixes it before ending the turn — in all modes including headless.

## Goal Keywords

typecheck, tsc, Stop hook, block, decision, re-enter model context, headless, CLAUDE_TYPECHECK_GATE, changed TS files

## Design (boring, mirrors existing precedents)

Port the proven detection logic of `typecheck-changed.sh` into Node and give it the block mechanism of `src/hooks/goal-drift-stop.mts`.

**WILL build:**
- `src/lib/typecheck-gate.mts` — pure helpers: `resolveTypecheckMode(env)`, `hasChangedTsFile(files)`, `pickTypecheckCommand(pkgJson, hasLocalTsc)`, `formatTypecheckReason(output)`, `decideTypecheckAction({mode, ranTypecheck, rc})`.
- `src/hooks/typecheck-stop.mts` — Stop hook: resolve mode (default OFF) then resolve git root (CLAUDE_PROJECT_DIR or `git rev-parse --show-toplevel`) then require `tsconfig.json` then collect changed TS files (`git diff` + `--cached`, filter `.(ts|tsx|mts|cts)`) then pick `npm run --silent typecheck` else local `tsc --noEmit` else no-op then run (bounded timeout); on rc not 0: `block` emits `{"decision":"block","reason":<last 15 lines>}`, `warn` prints to stderr, `off` no-op. Fail-open on every error (exit 0).
- Wire it into `src/lib/plugin-metadata.mts` Stop array + update the hooks description prose.

**Env var:** `CLAUDE_TYPECHECK_GATE` = `off` (default) | `warn` | `block`. Modes mirror `CLAUDE_GOAL_DRIFT_GATE`.

**Will NOT build:**
- A default-on block. Default is OFF, not warn: the global `typecheck-changed.sh` already emits an advisory `systemMessage`, so a warn default would double up; and a default block would trap every interactive session on any pre-existing type error. Opt into `block` in autonomous/headless loops (where the loop already gates on `tsc` anyway). Zero regression when unset. Consistent with the `CI_GATEGUARD_TARGET_LOCK` default-off enforcement I shipped in v3.18.0.
- Edits to the global `~/.claude/scripts/typecheck-changed.sh`. It is not in this repo, can't go through PR flow, and affects every project. It stays the advisory layer; this hook is the opt-in enforcement layer.
- Per-edit (PostToolUse) typechecking — running `tsc` after every Edit is too slow. Stop-boundary once per turn is the right cadence, and it fires in `-p` runs.

## Timeout

`tsc --noEmit` can exceed the 5s hook budget the other hooks use, so the wiring timeout for this command is 30s and the internal spawn timeout ~25s. On timeout the hook fails open (allow) rather than blocking on an inconclusive check. Near-zero cost when no TS file changed or mode is off.

## Verification

- `src/test/typecheck-gate.test.mts` — pure helpers: mode default/parse, TS-file filter, command selection, reason truncation, decision matrix.
- `src/test/typecheck-stop-hook.test.mts` — integration: temp git repo + `tsconfig.json` + a `package.json` whose `typecheck` script exits non-zero (mock, no real tsc needed); assert `block` gives `{"decision":"block"}` with reason; `typecheck` exits 0 gives allow; mode off gives allow; no changed TS file gives allow; no tsconfig gives allow.
- `npm run verify:all` green; new `.mjs` (hooks + lib + mirrors) staged with `git update-index --chmod=+x` (Linux CI `verify:generated` mode check).

## Will NOT repeat (P-MAG)

`Will NOT repeat:` staging a new `.mjs` without its +x bit (PR #183 class) — run `git update-index --chmod=+x` on every new hook/lib `.mjs` and mirror before commit. Rebuild before every stage (`feedback_mts_is_source`). Stage by filename (`feedback_no_git_add_all_on_windows`).
