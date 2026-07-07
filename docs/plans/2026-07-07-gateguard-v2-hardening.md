# Gateguard v2 hardening — three friction-driven fixes

Date: 2026-07-07
Branch: `feat/gateguard-v2-hardening` (stacked on `feat/gateguard-exclude-paths` / `e0650b5`)
Driver: `/insights` report `2026-07-07-004914` surfaced three recurring friction categories; a 9-agent adversarial survey (workflow `wf_8410d9c5-782`) confirmed each against the live harness with file:line evidence.

## Goal

Close the three highest-value gaps between what the operator repeatedly hits and what the gateguard hook actually enforces. One concern per commit, all on `src/hooks/gateguard.mts` (+ `src/lib/gateguard-state.mts` for RISA 2, + `commands/`+`skills/reconcile.md` for RISA 3). `.mts` is source; `npm run build` regenerates the `.mjs` and the `plugins/` mirror — commit both.

## Goal Keywords

gateguard, destructive-bash, commit message, PR body, target-lock, wrong-repo, worktree, brace ref, @{u}, quoting, reconcile

## The three items (original recommendation order)

### RISA 1 — G3: stop stranding verified finalization (CONFIRMED_GAP)

**Problem:** the `destructive-bash` branch (`gateguard.mts:268-272`) substring-matches 19 patterns against the *whole* command, including the prose inside `-m` / `--body` / `-F` values. `git commit -m "refactor: drop the stale format helper"` false-trips on `drop `/`format `; `gh pr create --body "…truncate the logs…"` false-trips on `truncate `. Finished, tested work gets stranded on its own commit message.

**WILL build:** a `stripMessageArgs()` pass that blanks the *values* of message/body-carrying flags (`-m`, `--message`, `-F`, `--file`, `--body`, `--body-file`, `--title`, `--notes`, `-C`, `--reuse-message`) before the destructive scan runs. Deliberately excludes `-c` so `bash -c "rm -rf /"` still gates.

**Will NOT build:** a blanket bypass for genuinely destructive commands. `git branch -D`, `git reset --hard`, `--force-with-lease`, `rm -rf` are command-syntax tokens, not quoted prose — they stay gated exactly as before (the operator's own CLAUDE.md wants force-push/reset to halt-and-ask).

**Verification:** node --test on new gateguard-hook cases — `git commit -m "…drop…format…"` → allow; `gh pr create --body "…truncate…"` → allow; `git branch -D feat/x` → still block; `rm -rf node_modules` → still block.

### RISA 2 — G2: block wrong-repo / wrong-worktree writes (PARTIAL, prose-only today)

**Problem:** the first-Write/Edit deny demands 4 grounding facts but never checks the target path lives inside the session's git root. You can present perfect facts about the wrong file. The prose Parallel-Actor Gate + worktree-safety Five-Check Envelope mandate this check; no hook runs it.

**WILL build:** an opt-in `CI_GATEGUARD_TARGET_LOCK=block` mode. When set, a mutating call whose **absolute** target canonicalizes outside the session project root (`resolveProjectRoot()`) is denied with an identity-mismatch reason. Relative paths resolve under cwd (= root) and always pass; only an absolute path into a different tree is denied. Default (unset) = current behaviour, zero regression — this is the "warn-first rollout": ship non-enforcing, operator flips to `block` in multi-worktree/headless sessions. Mirrors the existing `CLAUDE_GOAL_DRIFT_GATE=block` precedent.

**Will NOT build:** a default-on hard block (would break legitimate out-of-root edits: `~/.claude`, `/tmp` scratch, sibling repos). No new state file — reuses `resolveProjectRoot` + the existing canonicalizers.

**Verification:** node --test — with `TARGET_LOCK=block` + a known `CLAUDE_PROJECT_DIR`: absolute in-root target → normal fact gate (not mismatch); absolute out-of-root → mismatch deny; same out-of-root with TARGET_LOCK unset → normal fact gate (default-off proof); relative path → not target-locked.

### RISA 3 — G1: kill the unquoted `@{u}` retry loop (CONFIRMED_GAP)

**Problem:** Claude Code's built-in Bash parser trips on the braces in an unquoted `@{u}` / `@{upstream}` ref and blocks post-hoc, costing a retry (measured in 4+ sessions). Worse, the harness's own `reconcile` command/skill *prescribes* the failing unquoted form.

**WILL build:** (a) doc fix — quote `'@{u}...HEAD'` in `commands/reconcile.md:19` and `skills/reconcile.md:28`; (b) a quote-aware `findUnquotedBraceRef()` detector in the Bash path that denies a command carrying an unquoted `@{…}` and prints the *exact* quoted replacement command, so the correction lands before the opaque built-in block.

**Will NOT build:** a general shell-lint. Scope is `@{…}` refs only — the measured failure. Quoted `'@{u}'` passes untouched.

**Verification:** node --test — `git rev-list --left-right --count @{u}...HEAD` → block, reason contains the quoted fix `'@{u}...HEAD'`; the same command already quoted → allow; `git status` → allow (no false-positive).

## Will NOT repeat (P-MAG Rule 3)

`Will NOT repeat:` shipping a `.mjs` edit or staging a stale build the way PR #151 did — every `.mts` edit gets a fresh `npm run build` immediately before `git add`, and both source + generated mirror are staged together (`feedback_mts_is_source.md`). Stage by explicit filename, never `git add .` (`feedback_no_git_add_all_on_windows.md`).

## Verification ladder (per item + final)

Per item: `npm run build` → `node --test test/gateguard-hook.test.mjs test/gateguard-state.test.mjs` → `npm run verify:generated`. Final: `npm run verify:all` (14 invariants + typecheck).

## PR sequencing (auto-merge ordering hazard)

Two stacked PRs. The `feat/gateguard-exclude-paths` base PR (e0650b5) must merge **before** this one, or the stack rebases onto a stale base. Gate the hardening PR on the base PR completing first (`feedback_auto_merge_ordering.md`).
