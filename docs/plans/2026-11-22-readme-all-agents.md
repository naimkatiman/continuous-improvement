# README for every coding agent, with images from real runs

- Date: 2026-11-22
- Status: built on `docs/readme-visual`, not pushed
- Supersedes for the README: [2026-11-20-frontier-model-refresh.md](2026-11-20-frontier-model-refresh.md), [2026-08-22-readme-still-useful.md](2026-08-22-readme-still-useful.md), [2026-06-28-readme-progressive-disclosure.md](2026-06-28-readme-progressive-disclosure.md)
- Changes an owner decision in: [2026-11-21-all-agents.md](2026-11-21-all-agents.md) ("Positioning")

## Owner's request

"now improve the readme...make it readable put some inforgrapihcs and demos",
then "and dont mention this is only for claude code...this is for all agents
outside thre..put the one working only".

## Decisions

1. **Positioning.** Guardrails for coding agents. Claude Code is one supported
   agent, with its own section, not the frame of the document. The npm
   description, the llms.txt summary, the keywords and the AGENT-SUPPORT intro
   drop "Claude Code first". The landing page copy is a follow-up.
2. **Only working agents in the README.** The README tier table and its map
   list the rows where the guard blocks a destructive command
   (`blocksPreTool`, Junie included with its Early Access condition): 16 of
   19. Kiro IDE, Zed and Aider stay in `docs/AGENT-SUPPORT.md`, which keeps
   every row, and in the landing table. The README links to the support doc
   once for other agents. The rules-file target table, which names Zed, Aider
   and Windsurf, moves to the new hand-written `docs/INSTALL-TARGETS.md`.
3. **Readable first screen.** What it is, the six-agent demo, the install
   table and a 30-second check. The native-feature comparison, the hook table,
   the slash commands and the reference move lower, into `<details>` blocks.
4. **Images from data.** Every image under `assets/readme/` is an SVG string
   built by code: the agents map by `bin/check-agent-matrix.mjs` from
   `src/lib/agent-support.mts`, the terminal cards and the two diagrams by
   `bin/render-readme-assets.mjs`. The cards draw their output from
   `demo/captures/demos.json`, which `bin/capture-readme-demos.mjs` writes from
   real runs of the hooks in a temp HOME. The README shows them with HTML
   `<img>` so the claim scan does not read alt text as prose.

## Gates

| Gate | Proof |
|---|---|
| README table and map list only blocking rows; AGENT-SUPPORT keeps 19 | `src/test/check-agent-matrix.test.mts`, `npm run verify:agent-matrix` |
| A committed image differs from what its data draws | `src/test/render-readme-assets.test.mts` ("match what the capture draws now") |
| A card shows output the capture does not hold | `renderReadmeAssets` throws; the same test file |
| The capture drifts from what the hooks print | "is what this checkout's hooks and tools print now" |
| Every pinned README string survives | `npm run verify:all` (command-count, tool-count, skill-count-prose, docs-substrings, doc-runtime-claims, agent-matrix) and `npm test` |
| The README renders on light, dark and a 390px screen | Edge headless screenshots of the GitHub-rendered HTML |

## Facts re-checked on 2026-11-22

- `npm view continuous-improvement dist-tags`: `latest` is 3.27.0, which
  carries the observer and linter fixes.
- `git ls-remote --tags origin`: `v3` peels to `cb46c89`, the 3.27.0 release
  commit.
- The 3.27.0 tarball has no `--hooks` install and no `lib/hook-io.mjs`: the
  other-agent guard ships in the next release. The README says so.

## Follow-ups, not in this pass

- `docs/landing/index.html` still says "Claude Code first" in its head tags
  and footer.
- `install --help` still says hooks and MCP stay Claude Code only for non-Claude
  targets (`src/bin/install.mts`, `src/lib/install-targets.mts`).
- The images must be merged to `main` before the next npm publish: npm loads
  relative images from the GitHub default branch, not from the tarball.
