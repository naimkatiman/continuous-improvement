# Install targets: rules files

`npx continuous-improvement install --target <agents>` writes the 7 Laws text as a rules file into the current project, for example `--target gemini,codex,cursor,windsurf,zed,aider,copilot`. With no `--hooks`, those agents get no hooks, no MCP server and no lessons from it: the file is text the agent reads.

| Target | File written |
|---|---|
| `gemini` | `GEMINI.md` |
| `codex` | `AGENTS.md` |
| `cursor` | `.cursor/rules/continuous-improvement.mdc` |
| `windsurf` | `.windsurf/rules/continuous-improvement.md` |
| `zed` | `.rules` |
| `aider` | `CONVENTIONS.md`, plus a minimal `.aider.conf.yml` if none exists |
| `copilot` | `.github/copilot-instructions.md` |

`GEMINI.md`, `AGENTS.md`, `.rules`, `CONVENTIONS.md` and `copilot-instructions.md` are shared files: the text goes into a managed block, so what you wrote there stays and a reinstall replaces only the block. The Cursor and Windsurf files belong to this package and are written whole.

`--target <agent> --hooks` installs the guard hooks for the agents that have a hook this package can use, and writes or prints the MCP server step. Which agents those are, what each one blocks and the step that follows each install are in [AGENT-SUPPORT.md](AGENT-SUPPORT.md). Saved lessons reach an agent with no session hook through `npx -p continuous-improvement ci lessons --format <agent> --write`.

`--hooks`, `--uninstall --target <agent>` and `ci lessons` need 3.28.0 or later.

## Undoing an agent install

`install --uninstall --target <agent>` removes what `--hooks` recorded for that agent. A vendor `mcp add` it did not undo (run without `--run`, or a failed undo) keeps the agent recorded, and its runtime copy kept, until `--uninstall --target <agent> --run` undoes it; an undo that fails twice is taken as removed by hand, and the uninstall says so.

`npx continuous-improvement install --uninstall` leaves a rules file that `--target` wrote without `--hooks`. Delete it by hand.
