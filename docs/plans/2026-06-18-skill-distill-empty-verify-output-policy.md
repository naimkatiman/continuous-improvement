# 2026-06-18 — skill-distill empty verification-output policy

- Status: design note / owner decision required before success-policy implementation
- Scope: docs-only policy proposal; this note is now aligned with the 2026-06-19 event-pass-through prerequisite; no runtime behavior change in this run

## Goal

Close the remaining PR #154 audit deferral for `skill-distill`: a verify command with
an empty `output_summary` currently counts as a successful `verify-exit-0` signal. The
policy needs to preserve legitimate silent verification commands without letting a
missing, pre-execution, truncated, or ambiguous output row teach the distiller a false
"successful workflow" pattern.

## Grounded findings

Research for this note inspected `src/lib/skill-distill.mts`,
`src/bin/mcp-server.mts`, `src/bin/observe.mts`, `src/lib/observe-event.mts`,
`src/test/skill-distill.test.mts`, `src/test/hook.test.mts`, `CLAUDE.md`, and
`docs/audits/2026-06-03-new-feature-audit.md`.

Current behavior:

- `classifyTrajectorySuccess()` treats a Bash row as `verify-exit-0` when:
  - the command matches `VERIFY_CMD`;
  - the output does not match `FAILURE_MARKER`; and
  - `output_summary === ""` **or** the output matches `SUCCESS_MARKER`.
- `workflowRunFromObservations()` uses the same success branch through
  `isVerifySuccessRow()` for the post-Workflow proof command.
- `observe.mts` writes `event: "tool_start"` when no `tool_response` exists and
  `event: "tool_complete"` when a response exists.
- `DistillObservation` now includes optional `event`, and `readDistillObservations()`
  passes it through with `event: getString(observation.event)` (2026-06-19
  prerequisite increment). The distiller can now see the lifecycle marker, but
  `classifyTrajectorySuccess()` and `workflowRunFromObservations()` still do not use
  it when deciding whether a verify row proves success.
- `summariseOutput()` stores only a 200-character response summary. It does not
  persist an explicit exit code or success status into the observation row today.
- Distilled candidates remain low-confidence drafts and require explicit promotion,
  so the risk is not automatic behavior change; the risk is polluted recommendations
  and reduced trust in Law 7 learning.

## Non-goals

- Do not auto-promote any distilled skill.
- Do not change hook fail-open semantics.
- Do not change MCP tool schemas without a focused implementation PR.
- Do not infer success from a human final response unless the existing
  `reflection-pass` branch explicitly sees a verification statement.
- Do not widen `VERIFY_CMD` casually; command recognition and success recognition
  should remain separate decisions.

## Options matrix

| Option | Policy | Pros | Cons / risk | Implementation size | Recommendation |
|---|---|---|---|---|---|
| A | Keep current rule: empty output from a matching verify command counts as success. | No churn; preserves silent command recall. | A `tool_start` row, missing response, or empty failing response can be misread as success. Keeps the audit deferral open. | None | Reject. |
| B | Marker-only: require `SUCCESS_MARKER`; empty output never counts. | Simple; closes false positives without schema changes. | Loses legitimate silent checks (`tsc --noEmit`, quiet build/typecheck commands) unless a later reflection saves them. | Small pure-function change + tests | Acceptable but overly lossy. |
| C | Event-aware minimal policy: use the now-carried `event` marker so only `tool_complete` rows can prove verify success; empty output on completed rows still counts. | Removes the biggest ambiguity: pre-tool rows stop proving success. | Still treats a completed-but-empty nonzero command as success because no exit metadata is persisted. | Small pure-function change + tests; the field pass-through prerequisite is already complete. | Useful partial fix, not enough alone. |
| D | Explicit-success model: add `event` and explicit status/exit metadata when available; success requires a completed row plus either explicit success metadata or a success marker. Empty output with no explicit success does **not** count as `verify-exit-0`; rely on `reflection-pass` for legacy/silent rows without metadata. | Fails closed on ambiguous output while keeping a path for truly silent commands once the observer can record an exit/status signal. Aligns with the 2026-06-03 boundary-safety lesson. | Requires a small observation data-model extension and fixtures for payload shapes. If Claude's hook payload lacks exit metadata, silent commands without a reflection will no longer seed candidates. | Medium: observe-event extraction + distill mapping + tests | Recommended. |
| E | Command allowlist for silent success: completed empty output counts only for commands known to be normally silent. | Keeps selected silent commands without waiting on exit metadata. | Still guesses success from absence. Allowlist becomes policy debt and may differ by tool/version. | Medium | Only consider as a fallback if explicit status is unavailable and the owner accepts the false-positive tradeoff. |

## Recommended policy

Adopt **Option D**.

A verification row should prove success only when all required boundaries are known:

1. **Command boundary:** `input_summary` matches `VERIFY_CMD`.
2. **Completion boundary:** `event === "tool_complete"` for rich rows. Legacy rows with
   no event may only pass through the non-empty success-marker path.
3. **Failure boundary:** `FAILURE_MARKER` must not match the output summary.
4. **Success boundary:** one of the following is true:
   - explicit status/exit metadata says success / exit 0; or
   - non-empty `output_summary` matches `SUCCESS_MARKER`; or
   - the trajectory later satisfies the existing `reflection-pass` branch.

Under this policy, `output_summary === ""` alone is **unknown**, not success. Unknown
verification should not create `verify-exit-0` evidence; it can still become a draft if
the session contains a separate reflection statement such as "verified: typecheck
passed".

## Proposed implementation shape after approval

1. Keep the completed `event` pass-through in place (`DistillObservation.event` plus
   `readDistillObservations()` mapping). Add optional `exit_code` and/or `status` only
   after source payload evidence shows a reliable field to persist.
2. Teach `readDistillObservations()` to pass through any explicit status fields already
   present in `observations.jsonl` if/when the observer starts writing them.
3. Probe real Claude Code Bash `tool_response` payloads in a small fixture or doc note;
   if exit/status is present, extend `observe-event.mts` / `observe.mts` to persist it.
4. Replace the `output === "" || SUCCESS_MARKER.test(output)` branch with a helper such
   as `hasVerifySuccessSignal(obs)` implementing the recommended policy.
5. Reuse the helper in both `classifyTrajectorySuccess()` and
   `workflowRunFromObservations()` so candidate mining and Workflow drafts share the
   same proof model.
6. Keep old observation rows backward-compatible but fail closed: legacy empty output
   does not prove success without a success marker or reflection.

## RED tests to write before code

- A Bash `tool_start` row for `npm test` with empty output does not mark a trajectory
  as succeeded.
- A rich `tool_complete` row with empty output and no explicit status does not mark a
  trajectory as succeeded.
- A rich `tool_complete` row with explicit success metadata and empty output does mark
  the trajectory as `verify-exit-0`.
- A legacy no-`event` row with empty output does not mark a trajectory as succeeded.
- A legacy no-`event` row with a non-empty success marker still marks the trajectory as
  succeeded.
- `workflowRunFromObservations()` follows the same rules for the verification row after
  a Workflow launch.
- Existing failing-output and reflection-pass tests remain green.

## Verification plan for the implementation PR

- `npm run build`
- `node --test test/skill-distill.test.mjs`
- Add/adjust observe-event tests if exit/status extraction is implemented, then run the
  corresponding generated test file.
- `npm run verify:all`
- `npm run verify:generated`

## Decision needed

Owner/Fatin review should answer:

1. Should ambiguous empty output without explicit status be treated as unknown (this
   note's recommendation) or allowed for a narrow command allowlist?
2. Is it acceptable for silent legacy rows to require a later `reflection-pass` instead
   of becoming `verify-exit-0` evidence?
3. If Claude Code's Bash response lacks exit metadata, should the project still ship the
   fail-closed marker-only/event-aware subset, or wait until a reliable status signal is
   available?
