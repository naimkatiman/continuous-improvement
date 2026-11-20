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

The runtime gate ships as a PreToolUse hook (`hooks/gateguard.mjs`). Probe it with
a deny that is the same in every file gate mode: run `git rev-parse @{u}` through
the shell tool (Bash or PowerShell) with the ref **unquoted**, exactly as written.

- If the hook **blocks** the command and the reason starts `Unquoted git ref @{u}`,
  the runtime layer is wired. Record `gateguard: ✓`. Do not retry with the
  quoted ref; the block is the pass.
- If the command **runs** (it prints the upstream ref, or git reports that there
  is no upstream), or it is stopped with any other message, the hook did not
  load. Record
  `gateguard: ✗ (hooks/gateguard.mjs not wired — see README → Troubleshooting install)`.

Do not probe with a file write. The file gate defaults to
`CI_GATEGUARD_FILE_GATE=evidence`, which allows a new file and allows an existing
file once the session has read it, so a write that goes through proves nothing.
`CI_GATEGUARD_EXCLUDE` and `CI_GATEGUARD_FILE_GATE=off` switch the file gate off
without unwiring the hook, and neither changes this probe.

## Check 3 — observation capture recording

The observation hook appends one row per tool call to
`~/.claude/instincts/<project-hash>/observations.jsonl`. Read that file (resolve
`<project-hash>` from the current repo, or check `~/.claude/instincts/global/`).

- If it exists and has at least one row — capture is recording. Record `observe: ✓`.
- If it is missing or empty, record `observe: ✗ (observation hook not recording; re-run
  the installer to migrate legacy Bash hook rows to the Node observer)`.

## Report

Emit exactly one summary line, nothing else after it:

- All three passed: `✓ wired — commands, gateguard, observe all confirmed.`
- Any failed: `✗ <comma-separated failing checks with their fix hints>.`

Do not claim "should be fine" for a check you could not actually run. If a check
is genuinely unrunnable (e.g. no repo context for the project hash), mark it
`unverified` with the reason rather than `✓`.
