# Plan: enforcing-hook pack (v1) — push-to-main + commit-size PreToolUse gates

- Date: 2026-06-17
- Branch: `feat/enforcing-hook-pack` (off `origin/main` 136b7f1)
- Closes: the WILD pilot from the 2026-06-17 report-coverage map (convert the prose-only commit/branch discipline into enforced gates). Partial enforcement for R3/R5/R11/R12.
- Decisions (operator, this session): **v1 scope = Core two** (push-to-main + commit-size); **default mode = warn, opt-in block** via `CLAUDE_CI_HOOKPACK_GATE`.

## Goal

A single PreToolUse hook (`hook-pack`) that gates two Bash actions the repo currently only advises against in prose:

1. **push-to-main** — a direct `git push` to a protected branch (`main`, `master`, `release/*`).
2. **commit-size** — a `git commit` whose staged set exceeds 15 files (the one-concern limit).

Warn by default (never blocks); the operator opts into hard blocking per the goal-drift precedent.

## Why

The coverage map's core finding: the discipline behind R3/R5/R11/R12/R14 exists as advised prose but only gateguard and the typecheck hook enforce at the tool boundary. The report's own failures (auto-push, bundled commits) happened despite the prose. This pack converts the two highest-value, lowest-false-trip rules into enforced gates.

## Design

### Mode (mirrors `goal-drift-stop`)

`CLAUDE_CI_HOOKPACK_GATE = warn (default) | block | off`, resolved like `resolveMode()` in `src/hooks/goal-drift-stop.mts`.
- `warn`: print a one-line notice to stderr, exit 0, empty stdout (allow).
- `block`: emit the PreToolUse deny shape and exit 0.
- `off`: no-op, exit 0.

### Output contract (PreToolUse)

- Allow / warn: **empty stdout** (a bare `{"decision":"allow"}` is schema-invalid and floods errors — see memory `project_pretooluse_hook_output_schema`).
- Block: `{ "hookSpecificOutput": { "hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "<reason>" } }` to stdout, exit 0.

### Gates

The hook reads the PreToolUse payload (`tool_name`, `tool_input.command`). It early-exits (allow) for any command that is not `git push` / `git commit` — no subprocess spawned on unrelated Bash, so latency only applies to git commits/pushes.

1. **push-to-main** — on `git push`: resolve the target branch (explicit `git push <remote> <branch>` / `HEAD:<branch>`, else current branch via `git rev-parse --abbrev-ref HEAD`). If it matches the protected list (`main`, `master`, `^release(/|$)`), gate. `--dry-run` always allowed. Reason: "Direct push to a protected branch — use a feature branch + PR."
2. **commit-size** — on `git commit` (excluding `--amend`): count staged files via `git diff --cached --name-only`. If > 15, gate. Reason: "Staged set exceeds the 15-file one-concern limit — split by layer; if this is generated output (lockfile/migration/snapshot/build) set CLAUDE_CI_HOOKPACK_GATE=off for this commit."

### Pure, unit-testable functions

- `resolveMode(env): "warn" | "block" | "off"`
- `classifyPush(command, currentBranch, protectedList): { gated: boolean, branch: string | null }`
- `shouldGateCommitSize(stagedCount: number, limit = 15): boolean`
- `buildDecision(mode, gated, reason): { allow: true } | { deny: payload } | { warn: string }`

Fail-open on malformed input: empty/unparseable command, non-git command, or a failed git subprocess → allow (never crash, never deny on uncertainty).

## Components / files

Source (hand-authored):
- `src/lib/hook-pack-gate.mts` — pure gate logic (mode + classifiers + decision builder), built to `lib/hook-pack-gate.mjs`. Lives in `lib/` so unit tests can import it — the `test-imports-only` invariant forbids importing from `hooks/`. Mirrors the gateguard `lib/gateguard-state` and goal-drift `lib/goal-drift-gate` split.
- `src/hooks/hook-pack.mts` — the hook I/O shell (stdin parse, `git` subprocess for current branch / staged count, calls the lib core, writes deny-or-empty stdout), built to `hooks/hook-pack.mjs`.
- `src/lib/plugin-metadata.mts` — register `hook-pack.mjs` in `getPluginHooksConfig()` PreToolUse array, **after** `gateguard` (the existing `gateguard-hook.test` asserts gateguard is first — must not break it).
- `src/test/hook-pack.test.mts` — TDD: table-driven unit tests importing `../lib/hook-pack-gate.mjs` + an integration test spawning the built `hooks/hook-pack.mjs` over stdin for warn/block/off; plus a registration assertion (hook-pack present, gateguard still first).

Generated (via `npm run build`, committed, never hand-edited):
- `hooks/hook-pack.mjs`, `plugins/continuous-improvement/hooks/hook-pack.mjs`
- `plugins/continuous-improvement/hooks/hooks.json` (regenerated from `getPluginHooksConfig`)

Docs (optional, only if a runtime-gate claim is added): reference `hooks/hook-pack.mjs` within ±5 lines of any "runtime gate/blocks" prose to satisfy `doc-runtime-claims`.

## TDD / verification

1. RED: write `hook-pack.test.mts` first — pure-function cases (push to main gated; push to feature allowed; `--dry-run` allowed; 15 files allowed / 16 gated; mode off allows all; mode warn never denies; malformed/non-git allowed) + the registration assertion. Watch them fail.
2. GREEN: implement `hook-pack.mts` + register in `plugin-metadata.mts`.
3. `npm run build` (compiles `.mts` → `.mjs`, regenerates hooks.json + mirror).
4. `npm run verify:all` green (especially `everything-mirror`, `doc-runtime-claims`, `tool-count` unchanged, typecheck).
5. `npm run build && git diff --exit-code -- .claude-plugin bin hooks test lib plugins` clean (verify:generated).
6. Run `hook-pack.test` + `gateguard-hook.test` in isolation (host is load-prone) → green.
7. Stage by explicit filename. One commit citing this plan. Open PR; do not merge.

## Risks

- **Breaking "gateguard is first PreToolUse"** — register hook-pack second; the existing test pins this.
- **PreToolUse schema** — emit the deny shape exactly; empty stdout for allow (memory `project_pretooluse_hook_output_schema`).
- **Global blast radius** — ships to all projects via the plugin; warn-default means zero behavior change until the operator sets `=block`.
- **Latency** — only git push/commit commands trigger a subprocess; everything else early-exits.
- **`.mts` is source** — rebuild before every stage; never hand-edit the `.mjs` or the generated hooks.json (memory `feedback_mts_is_source`).

## Done when

`verify:all` green + the new tests green + PR open + this plan cited. Merge and any `=block` opt-in are the operator's call.
