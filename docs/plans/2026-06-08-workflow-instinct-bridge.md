# 2026-06-08 — Workflow-run → instinct bridge

## Goal

Make a completed native Workflow run (Opus 4.8 orchestration / ultracode) leave a
durable trace in the Mulahazah learning engine, so the lessons of an expensive
multi-agent run survive the run instead of evaporating when the turn ends — the one
integration a per-turn orchestration primitive cannot do for itself, and the concrete
payoff of the PR #225 repositioning.

## Probe findings (grounded, not assumed)

Two probes against the live observation feed (`instincts/<hash>/observations.jsonl`)
settled the design:

- **Sub-agent activity is captured** — a Workflow/Agent sub-agent's own tool calls
  land in the same feed, tagged with the **parent** session id (not a separate one).
  So no journal parsing and no trajectory-split complication.
- **The `Workflow` row carries the script** in `input_summary` as `{"script":"..."}`,
  truncated to ~500 chars — `meta.name`/`meta.description`/`meta.phases` sit at the top
  and survive truncation. `output_summary` = `{"status","taskId","runId","summary"}`.
- **The feed records the launch, not the completion** — `status: "async_launched"`.
  So workflow success is NOT in the Workflow row; it must be inferred from a following
  verify-exit-0 in the same session. This is the success gate.
- The reader `readDistillObservations` (mcp-server.mts) maps every row with no `event`
  filter, so both `tool_start` and `tool_complete` flow in; a *completed* row is one
  with a non-empty `output_summary`. Some bare rows lack `input_summary` → parse
  defensively.

## Design (reuse first — Law 1)

Extend `src/lib/skill-distill.mts`; reuse `serializeDraft`, the `drafts/` ladder
(`ci_distill_propose`→edit→`ci_distill_promote` at 0.5), and the `slugify` path guard.
Two new pure functions (no I/O):

- `workflowRunFromObservations(observations): WorkflowRun | null` — finds the most
  recent `tool === "Workflow"` row with a parseable `{"script":...}` in
  `input_summary`, extracts `name`/`description`/`phases` from the script head, and
  requires a following verify-exit-0 (reusing the existing success classifier on the
  post-Workflow slice). Returns `null` (fail closed) on: no Workflow row, unparseable
  meta, no `name`, or no following verification.
- `draftFromWorkflowRun(run): DraftInstinct` — body = name + description + phase
  outline + the verify command that proved it; `source: distilled-workflow`,
  `confidence: 0.4`, `status: draft`. The script is the recipe, so the body is real,
  not a placeholder; the human still edits before promote.

Singular-run rationale: the existing distiller requires a pattern across ≥2 sessions
(coincidence guard). A Workflow is an authored recipe, so a single verified run
warrants a draft — `minSessions`/`minOccurrences` do not apply.

## Surface

- MCP tool `ci_distill_from_workflow` (expert): `readDistillObservations` →
  `workflowRunFromObservations` → `draftFromWorkflowRun` → `serializeDraft` → write to
  `drafts/`. Promotion stays `ci_distill_promote`, unchanged. Tool count 18 → 19.
- **Deferred to a fast-follow PR (not in this commit)** — Stop hook
  `workflow-distill.mjs` (fail-open, opt-in, default off): on Stop, if the session
  shows a verified Workflow run, print ONE stderr nudge to run
  `ci_distill_from_workflow`. This PR ships the MCP tool only.

## Fail-closed boundaries (the 2026-06-03 audit lesson)

RED tests first for: no Workflow row → null; Workflow row with empty/unparseable
`input_summary` → null; `async_launched` with no following verify → null; verify
present → run returned; traversal-hostile `meta.name` → slugified id stays inside
`drafts/`; truncated script (meta intact) → parsed; truncated script (meta cut) →
null, never fabricated.

## Files

- `src/lib/skill-distill.mts` — two functions + `WorkflowRun` type.
- `src/test/skill-distill.test.mts` — RED→GREEN boundary + happy-path.
- `src/bin/mcp-server.mts` — `ci_distill_from_workflow` case.
- `src/lib/plugin-metadata.mts` — `EXPERT_TOOL_ENTRIES` entry for the MCP tool.
- `docs/skills.md`, `README.md`, `QUICKSTART.md` — expert tool count 18 → 19.
- Generated (via `npm run build`): manifests + `plugins/` mirror + tool-count claims.
- **Deferred (fast-follow):** `src/hooks/workflow-distill.mts` + its
  `getPluginHooksConfig` Stop registration — the auto-detect nudge, shipped
  separately to keep this PR single-concern (the MCP capability).

## Verification

`npm run build` → `node --test test/skill-distill.test.mjs` (RED then GREEN) →
`npm run verify:all` (incl. tool-count 19) → `npm run verify:generated`. Adversarial
review (parallel reviewers) on the diff before PR.

## Follow-up: three gateguard defects found while unblocking (separate PR)

Not in scope here, logged so they are not lost:

1. **Cap counts raw keys.** `isCapReached`/the hook count `Object.keys(cleared_files).length`
   while `isFileCleared` canonicalizes — case/separator/drive-letter variants are stored
   as distinct keys (`markFileCleared` does canonicalize on store now, but legacy/mixed
   entries persist), so the 50-cap trips early on duplicate keys. Count canonical keys.
2. **Naive destructive substring match.** `isDestructiveBash` lowercases the whole
   command (including heredoc bodies) and substring-matches patterns like `format ` /
   `truncate ` / `drop ` — prose containing those words false-trips the gate. Match on
   token/command boundaries.
3. **Session dir is project-scoped, never resets.** `resolveSessionDir` keys only on
   project hash, so the "start a new session to reset" message is wrong — the file
   accumulates across days/sessions until manually deleted. Add a real per-session
   component or a SessionStart rotation.
