---
name: verify-install
description: Walk the post-install verification in one shot — confirm slash commands loaded, the gateguard runtime hook fires, and observation capture is recording — then print a single ✓ wired / ✗ missing line.
---

# /verify-install

Replaces the manual post-install dance (restart, run `/discipline`, hand-write a
hostile prompt, eyeball `/dashboard`) with one command that runs all three
checks and reports a single line.

Run the three checks **in order**. Do not skip a check because an earlier one
passed — each proves a different layer.

## Check 1 — slash commands loaded

If this command is executing, the marketplace did pick the plugin up and the
command registry loaded it. Record `commands: ✓`.

If you are reading this file directly rather than running it as `/verify-install`,
stop — the command is not registered. The fix is a Claude Code session restart
(slash commands load on session start). Record `commands: ✗ (restart the session)`.

## Check 2 — gateguard runtime hook fires

The runtime gate ships as a PreToolUse hook (`hooks/gateguard.mjs`). Probe it:
attempt to `Write` a throwaway file at a sandbox path (`./.ci-verify-install-probe.txt`
with the text `probe`) **without presenting any research first**.

- If the hook **blocks** the write with a fact-list reason — the runtime layer is
  wired. Record `gateguard: ✓`. Do not retry the write; the block is the pass.
- If the write **goes through** with no pause — the hook did not load. Record
  `gateguard: ✗ (hooks/gateguard.mjs not wired — see README → Troubleshooting install)`.
  Delete the probe file if it was created.

## Check 3 — observation capture recording

The observation hook appends one row per tool call to
`~/.claude/instincts/<project-hash>/observations.jsonl`. Read that file (resolve
`<project-hash>` from the current repo, or check `~/.claude/instincts/global/`).

- If it exists and has at least one row — capture is recording. Record `observe: ✓`.
- If it is missing or empty — record `observe: ✗ (observation hook not recording —
  on Windows confirm Git Bash / WSL is installed, then re-run the installer)`.

## Report

Emit exactly one summary line, nothing else after it:

- All three passed: `✓ wired — commands, gateguard, observe all confirmed.`
- Any failed: `✗ <comma-separated failing checks with their fix hints>.`

Do not claim "should be fine" for a check you could not actually run. If a check
is genuinely unrunnable (e.g. no repo context for the project hash), mark it
`unverified` with the reason rather than `✓`.
