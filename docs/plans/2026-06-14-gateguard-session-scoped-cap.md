# Gateguard cap: session-scoped + self-healing

Date: 2026-06-14
Branch: `fix/gateguard-session-scoped-cap`
Goal: stop the gateguard clearance cap from bleeding across concurrent same-day sessions and from requiring a manual `rm` to reset.

## Problem (root cause, verified in code)

The gateguard "per-session" clearance state is **not** session-scoped and **never** resets:

- `resolveSessionDir()` ([src/lib/gateguard-state.mts](../../src/lib/gateguard-state.mts)) keys the state dir on the **project hash only** — `~/.claude/instincts/<projectHash>/gateguard-session.json`. No session identifier anywhere. Every Claude session on the repo — sequential or concurrent — reads and writes the same file.
- `loadState` records `created_at` but never reads it for expiry. The 50-distinct-file counter (`MAX_CLEARED_FILES`) only grows until something deletes the file.
- On a multi-Claude host the shared counter fills from other sessions' work; every later session inherits a near-full gate and must prune by hand.
- The cap-reached block message tells the user "Start a new Claude Code session to reset the gate" ([src/hooks/gateguard.mts](../../src/hooks/gateguard.mts) `buildCapReachedReason`) — which does nothing, because a new session resolves to the same project-hash file. The documented intent ("the session itself is the trust boundary", gateguard.md) and the implementation disagree. That mismatch is the bug.

## Fix

1. **Session-scope the state dir.** `resolveSessionDir(sessionId?)`:
   - `GATEGUARD_SESSION_DIR` env override wins (tests) — unchanged.
   - else if `sessionId` present → `~/.claude/instincts/<projectHash>/sessions/<sanitizedSessionId>/`.
   - else → `~/.claude/instincts/<projectHash>/` (legacy fallback, unchanged path → back-compat).
   - `sessionId` is sanitized (`[^A-Za-z0-9_-]` → `_`, length-capped) so a hostile id cannot traverse.
2. **Hook reads `session_id` from stdin** (already a standard hook field — see recall-briefing.mts, observe-event.mts) and passes it to `resolveSessionDir`. Makes "start a new session to reset" true.
3. **TTL self-heal.** `loadState` returns a fresh empty state when `created_at` is older than `STATE_TTL_MS` (12h). Removes the manual-`rm` requirement on the fallback path; generous enough not to reset an active session mid-work.
4. **Fix the third caller (MCP `ci_gateguard_clear`).** It resolves the dir with no session context, so once the hook is session-scoped this route would write to the wrong file. Add an optional `state_path` param; when present the handler writes to `dirname(state_path)` (mirrors the `--state` CLI route). The hook prints `state_path` in the route-B instructions. Omitted → legacy `resolveSessionDir()` fallback.
5. **Align docs** in skills/gateguard.md so the reset story matches the code.

## Files

- `src/lib/gateguard-state.mts` — `resolveSessionDir(sessionId?)`, `STATE_TTL_MS`, TTL in `loadState`, header comment.
- `src/hooks/gateguard.mts` — read `session_id`, pass through, route-B `state_path` in block reason, accurate cap message.
- `src/bin/mcp-server.mts` — `ci_gateguard_clear` honors `state_path`.
- `src/lib/plugin-metadata.mts` — add `state_path` to the tool input schema.
- `skills/gateguard.md` — reset/cap wording.
- Tests: `gateguard-state.test.mts` (scoping + TTL), `gateguard-hook.test.mts` (session isolation end-to-end), `mcp-server.test.mts` (`state_path` routing).
- `npm run build` regenerates the `.mjs` mirror + plugin manifests; commit both.

## Verification

- RED first: new tests fail against current code.
- `npm run build` then `npm run verify:all` green.
- Cap-bounds-rogue-loop invariant preserved: within one session the 50-file cap still applies; only cross-session bleed and stale-file accumulation are removed.

## Out of scope (deferred, not dropped)

- Background GC of old `sessions/<id>/` dirs. TTL handles staleness on read; dir cleanup is cosmetic. Logged here, not implemented.
