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

## Review pass (2026-11-22)

A README review found the npm route broken for every agent but Claude Code
and the images unreadable on a phone. Closed on this branch:

- **npm is not the install route yet.** npm 3.27.0 ignores `--hooks` (and
  writes a rules file under `--dry-run`), runs its Claude Code uninstall for
  `--uninstall --target`, and has no `ci doctor` or `ci lessons`. The README
  installs, removes and checks from a clone (`node
  $HOME/continuous-improvement/bin/install.mjs ...`), with one "Not on npm
  yet" note; `ci <command>` is defined there. The dry-run capture's run line
  is the clone command.
- **Agent-neutral reference.** The MCP server has its own section; the
  wiring check, the hook table and the env table (`CI_*` first) are written
  for every agent; Claude Code's process count, `/mcp` naming and native
  comparison sit under Claude Code. Terms are defined at first use.
- **README table.** `--target` id, tier, Blocks, lessons, MCP, and a link to
  the agent's AGENT-SUPPORT section. The Install and Cannot cells stay in
  AGENT-SUPPORT, which the link reaches.
- **Images.** 640 wide, no font under 18, so 10px or more on a 390px phone
  (`smallestPhonePx` test). No in-image capture version (a test pins the
  capture version to `package.json`, and RELEASING step 1 recaptures). Bold
  Markdown drawn without asterisks; monospace only for commands, paths and
  output. `memory-parts.svg` replaces the memory chain with two tracks. The
  agents map is name chips under the tier meanings. Dark accent `#58a6ff`;
  a test checks every palette pair at 4.5:1 in both schemes.
- **Dark mode in `<img>`.** Checked in Edge: an SVG inside `<img>` follows
  the embedding page's `color-scheme`, not the OS preference, so on GitHub,
  which sets `color-scheme` per theme, the images follow the GitHub theme.
  Not checked on github.com itself, so no `<picture>` split.
- **Installer wording.** The rules-file note and `install --help` no longer
  say "Claude Code-only"; they name `--target <id> --hooks` (Zed and Aider:
  no usable hook).

## Follow-ups, not in this pass

- `docs/landing/index.html` still says "Claude Code first" in its head tags
  and kicker, and its table keeps all 19 rows (the agent-matrix test pins
  that). A landing pass should decide both.
- `llms.txt` still shows `npx continuous-improvement install --target <agent>
  --hooks` with no note that it needs the next release.
- The images must be merged to `main` before the next npm publish: npm loads
  relative images from the GitHub default branch, not from the tarball.
