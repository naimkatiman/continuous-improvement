# Observation Sharing Privacy Posture

- Status: docs-only posture note
- Scope: observation export/recall/privacy boundaries for Mulahazah data
- Last verified: 2026-06-18 11:30 MPST (+0800)
- Code changes: none

## Purpose

Mulahazah improves agent behavior by capturing local tool-call observations and turning repeated patterns into instincts, recall hits, and goal-drift signals. That data is useful precisely because it names real commands, files, summaries, and project context. This note pins the current privacy posture so future agents do not confuse "local-first learning" with "safe to share raw observation logs."

## Current source-inspected contract

| Surface | Current behavior | Privacy posture |
|---|---|---|
| Observation capture | `src/bin/observe.mts` appends one row to `~/.claude/instincts/<project-hash>/observations.jsonl` and creates `project.json` with project id/name/root when new. | Fully local and no network, but rows and project metadata can reveal commands, filenames, project names, and repository roots. |
| Observation summaries | `src/lib/observe-event.mts` records Bash command heads, Edit/Write/Read/NotebookEdit file paths, Grep/Glob patterns, and JSON summaries for unknown tools. Input is capped at 500 chars; output is capped at 200 chars. | Truncation bounds row size; it is not a full privacy sanitizer. Commands, paths, patterns, and short tool output can still contain sensitive project structure or accidental secret fragments. |
| Recent observations MCP view | `ci_observations` in `src/bin/mcp-server.mts` returns only timestamp, event, and tool for recent rows. | Lower-detail than raw JSONL, but still reveals activity cadence and tool usage. |
| Instinct export/import | `ci_export` returns learned instinct objects from `readInstincts(project.hash)`. `ci_import` accepts a JSON array and writes non-duplicate instincts. | Exports instincts, not raw observations. Instinct bodies may still encode project-specific practices, paths, or names; users should review before sharing. |
| Recall search | `ci_recall` reads the full local observation history, builds a BM25 index, and returns formatted hits. `src/lib/recall-index.mts` searches `tool`, `input_summary`, and `output_summary`. | Recall snippets are useful summaries, not a data export. They are redacted for common secret shapes before display, but they can still reveal paths, project names, errors, and workflow details. |
| Recall briefing hook | `hooks/recall-briefing.mts` is opt-in via `CLAUDE_RECALL_BRIEFING=1`, reads local observations, and injects at most one prompt-time reminder per session. `src/lib/recall-briefing.mts` displays up to the chosen hit limit from already-redacted recall hits. | Default off and local. When enabled, prior activity appears inside the agent context, so operators should treat it like any other local memory surface. |
| Security docs | `SECURITY.md` states no network access and warns users not to share `observations.jsonl` because it may contain file paths and project structure. | Correct directionally, but this posture note is the more complete source map for future implementation decisions. |

## Accepted posture today

1. **Local-first by default.** Hooks and MCP tooling operate on local `~/.claude/instincts/` data. There is no autonomous network upload path in the inspected observation/recall/export surfaces.
2. **Raw observation logs are not share artifacts.** `observations.jsonl`, rotated observation archives, corrupt-row quarantine files, and `project.json` should be treated as local operational data.
3. **`ci_export` is the sharing surface, but still needs review.** It exports instincts rather than observations. That is safer, but instinct text can still include project-specific names, paths, or practices.
4. **Recall redaction is best-effort.** `redactSecrets()` covers common AWS access keys, bearer tokens, KEY/SECRET/TOKEN/PASSWORD assignments, JWT-shaped tokens, and long hex strings. It is not a general PII, path, customer-name, private-hostname, or proprietary-code redactor.
5. **Observation capture favors learning utility over aggressive minimization.** Capturing Bash commands and file paths is intentional because downstream goal checks, recall, and distillation need concrete context.

## Operator/user guidance

- Do not paste raw `observations.jsonl` or `project.json` into public issues, chat tools, vendor support tickets, or shared PR comments.
- Before sharing `ci_export` output, review the JSON for project names, paths, customer names, and proprietary procedures.
- Treat `ci_recall` and recall-briefing output as local context. If copying a recall snippet into a public artifact, sanitize paths and proprietary details manually.
- Keep `~/.claude/instincts/` permission-restricted as already recommended in `SECURITY.md`.
- If an observation accidentally captures a secret, rotate the secret first; do not rely on recall-snippet redaction as remediation.

## Non-goals in this run

- No redaction-pattern changes.
- No observation schema changes.
- No MCP tool schema or behavior changes.
- No new dependency, DLP engine, telemetry system, analytics pipeline, or network service.
- No deletion, rotation, or mutation of local observation data.
- No release, generated-artifact, hook-install, or cron changes.

## Approval boundaries for future behavior changes

Owner/Fatin approval and TDD are required before changing any of these:

- widening or narrowing what `observe-event` captures;
- adding an observations export command;
- changing `ci_export` to include raw observations;
- changing `ci_recall` snippet fields, redaction semantics, or default hit count in a way that exposes more context;
- adding opt-in sync, analytics, cloud storage, or third-party processing;
- deleting or rewriting local observation history;
- changing documented security claims around local-only/no-network posture.

## Future implementation triggers and test expectations

A code change becomes worth considering only if users repeatedly need a safer share workflow or an audit demonstrates a concrete leak class. The smallest likely future increment would be a no-network sanitizer/export helper for selected instincts or recall snippets, not raw observation history.

If that happens, start with RED tests covering:

- common secret forms already covered by `redactSecrets()`;
- Windows and POSIX path redaction or pseudonymization if path sharing is in scope;
- project-root/project-name handling from `project.json`;
- non-Latin text preservation where it is not sensitive;
- explicit proof that raw observation rows are not included by default;
- `npm run verify:all` after behavior changes.

## Relationship to current backlog

This note clarifies the existing P3 backlog item "Strengthen privacy posture around observation sharing" without changing runtime behavior. It does not close every possible privacy improvement; it gives future agents and maintainers a stable contract for deciding whether a later sanitizer/export increment is warranted.
