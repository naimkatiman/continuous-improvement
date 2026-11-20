# Frontier-model refresh

- Date: 2026-11-20
- Status: in progress (updated in place as each PR lands)
- Base: `origin/main` at `b3477a3` (v3.26.0)
- Evidence: [docs/audits/2026-11-20-frontier-model-audit.md](../audits/2026-11-20-frontier-model-audit.md)

## Goal

A user on a Claude 5-family model who installs the plugin with the two-command
path gets value in the first session and the second, and never pays for
ceremony the model or Claude Code already performs.

## What the audit found

An 18-agent read-only audit (every skill verdict adversarially re-checked)
measured the shipped plugin against current Claude Code documentation and
against the hooks' real output. Four findings drive this plan.

1. **Default-on behaviour is the part a frontier model least needs.** The file
   gate denies the first edit of every file and is cleared by a self-attested
   shell call, which costs two extra tool calls per file and proves nothing. A
   Stop hook re-prompts any reply over 600 characters that lacks three fixed
   headings. A prompt router suggests skills on single common words.
2. **The memory claim has no runtime path.** Nothing loads an instinct into a
   later session. The session hook writes one line to exit-0 stderr, which
   neither the model nor the user sees. `/recall`, `/goal-check` and `/distill`
   need an MCP server that the plugin install does not register.
3. **Real defects.** The npm expert install has shipped a crashing observer
   and session hook since v3.24.0. `ci_create_instinct` and `ci_import` write
   to a caller-chosen path. Destructive commands through the PowerShell tool
   pass every guard. The observation log stores secrets unredacted. The
   transcript linter reports a clean bill on a real Claude Code transcript
   because it cannot parse one.
4. **The catalog grew after the retirement policy was written.** Of 28 skills,
   the verified verdicts are 0 keep-as-is, 14 slim, 4 merge, 10 retire.

## Non-goals

- No release, npm publish, tag move or Cloudflare Pages deploy.
- No change to `third-party/` snapshots.
- No MCP tool removal, no installer retirement, no pivot of instinct storage
  to native memory. Those are owner decisions and are listed under Deferred.

## PR train

Stacked, one concern each, merged in order. Each PR runs `npm run build`,
`npm run verify:all` and `npm test` green before it is pushed.

| # | Branch | Concern | Status |
|---|---|---|---|
| 1 | `fix/audit-defects` | Five verified defects, one commit each: installer copies the libs its hooks import; instinct ids are validated before they reach a path; the PowerShell tool is classified like Bash by the three guards; secrets are redacted when an observation is written; the transcript linter parses real Claude Code transcripts | pending |
| 2 | `feat/frontier-defaults` | Defaults for a model that already reads first: the file gate clears on evidence (a same-session Read of the target, or a new file) and denies only a blind edit; three-section close and the prompt router become opt-in; gateguard and companion-preference get matchers so read-only tools stop spawning them | pending |
| 3 | `feat/memory-loads` | Memory that reaches the next session: SessionStart prints this repo's instincts at 0.5+ to stdout so they enter context; the plugin bundle registers the MCP server so `/recall`, `/goal-check` and `/distill` work on the two-command install | pending |
| 4 | `docs/frontier-refresh` | README, QUICKSTART and landing page rewritten around what is not native, what turns on, what it costs and how to turn it off; stale claims removed; audit doc added | pending |
| 5 | `chore/retire-native-covered-skills` | Remove five prose-only skills that Claude Code covers natively (`token-budget-advisor`, `strategic-compact`, `state-reconciliation`, `recovery-classification`, `worktree-safety`). Top of the stack so it can merge or close without touching 1 to 4. Needs the owner's explicit decision | pending owner |

## Design decisions

- **Evidence over attestation.** The file gate reads this session's rows in the
  local observation log. A completed Read, Edit or Write of the target clears
  it silently, and so does a shell or search call that names the file. A new
  file is allowed, and so is every edit in a project with no observation log.
  A blind edit of an existing file is denied with a two-line reason: read the
  file and retry, then the manual clear command as the fallback.
  `CI_GATEGUARD_FILE_GATE=strict` restores the fact-list gate, `off` disables
  the file gate, and any other value is read as `evidence` with a stderr note.
  Destructive-command and target-lock checks are unchanged.
- **Opt-in means default off, old switches still honoured.**
  `CLAUDE_THREE_SECTION_CLOSE=on` and `CI_ROUTE_PROMPT=on` enable the two hooks;
  `CLAUDE_THREE_SECTION_CLOSE_DISABLED=1` and `CI_ROUTE_PROMPT_DISABLE=1` keep
  working.
- **One loader, existing store.** The instinct YAML store stays. The loader is
  capped (ten instincts, about 1.5 KB) and prints one line when there are none.
- **Docs describe the shipped default, with the hook file named beside every
  runtime claim** (the `verify:doc-runtime-claims` rule).

## Deferred (owner decisions, logged not dropped)

- Second retirement wave with slash-command or hook coupling: `tdd-workflow`,
  `superpowers`, `ralph`, `workspace-surface-audit`, `simplicity-review`, and
  the commands `/swarm`, `/learn-eval`, `/companion-preference`; merges of
  `/dashboard`, `/goal-check`, `/distill`, `/harvest`, the
  `/continuous-improvement` alias, `audit`, `handoff`, `grill-me`.
- Slimming the 14 skills the audit marked SLIM (targets and pinned strings are
  in the audit doc).
- MCP surface cut from 19 tools to about four.
- One install path: retire the npm hook installer in favour of the plugin.
- Lessons written to native memory instead of instinct YAML.
- Destructive commands return `ask` in interactive sessions.
- One Stop dispatcher process in place of five registrations; warn modes
  delivered through `additionalContext` instead of exit-0 stderr.
- `goal-drift-stop` scored per session; recall reads rotated archives.
- Portfolio CLIs and the `ci` CLI moved out of the published package.
