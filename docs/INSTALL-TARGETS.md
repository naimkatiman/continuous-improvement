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

`npx continuous-improvement install --uninstall` leaves a rules file that `--target` wrote without `--hooks`. Delete it by hand.
