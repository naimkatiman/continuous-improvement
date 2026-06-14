# Multi-platform installer — `--target <platform>`

Date: 2026-06-11 · Branch: `feat/multi-platform-installer` · Issues: #9 (Gemini CLI), #14 (Aider), #15 (Windsurf/Zed)
Status: complete (verified 2026-06-11)

## Goal (one sentence)

`npx continuous-improvement install --target <names>` installs the 7-Laws skill content into the rules file of other AI agent platforms, so the framework can be used by agents beyond Claude Code.

## Assumptions

- Non-Claude platforms consume plain-markdown rules files; none of them run our hooks, MCP server, or instinct learning. Non-Claude targets get the **skill text only**, and the installer says so explicitly.
- Project-level install (repo root via `git rev-parse --show-toplevel`, falling back to cwd) is the v1 contract for non-Claude targets. Global per-tool paths (`~/.gemini/GEMINI.md`, `~/.codex/AGENTS.md`) are deferred until someone asks.
- Platform file contracts (stable, pre-2026 conventions):
  - `gemini` → `GEMINI.md` (Gemini CLI default context file)
  - `codex` → `AGENTS.md` (agents.md standard; also read by opencode, Jules, Cursor ≥0.50)
  - `cursor` → `.cursor/rules/continuous-improvement.mdc` (mdc frontmatter, `alwaysApply: true`)
  - `windsurf` → `.windsurf/rules/continuous-improvement.md`
  - `zed` → `.rules`
  - `aider` → `CONVENTIONS.md` + `.aider.conf.yml` `read:` entry
  - `copilot` → `.github/copilot-instructions.md`

## Design

- New `src/lib/install-targets.mts` — target registry + pure functions (no fs):
  - `resolveTargets(csv)` → `{ targets, unknown }`
  - `stripFrontmatter(skillMd)` — drop the Claude skill frontmatter block
  - `renderForTarget(skillMd, target)` — per-target wrapping (mdc frontmatter for cursor; managed-block markers for shared files)
  - `mergeManagedBlock(existing, block)` — create / append / replace between `<!-- continuous-improvement:begin -->` and `<!-- continuous-improvement:end -->` markers; idempotent (second run is a no-op)
  - `planTargetWrites(target, skillMd, readExisting)` — returns `{ relPath, content }[]`; fs injected so it stays testable
- Shared files (`GEMINI.md`, `AGENTS.md`, `.rules`, `CONVENTIONS.md`, `copilot-instructions.md`) use the managed block so existing user content is never clobbered. Own-file targets (`cursor`, `windsurf`) are written whole.
- Aider conf: if `.aider.conf.yml` is absent, write a minimal one (`read: [CONVENTIONS.md]`). If present, do **not** mutate it (no YAML dependency, no risky string surgery) — print the one line the user should add.
- `src/bin/install.mts` wiring: parse `--target a,b,c` (default `claude`). `claude` keeps the existing flow untouched; other targets run the file plan against the project root with `✓` log lines and a Claude-only-features note. Unknown target → error listing valid names, exit 1. `--help` and examples updated.

## Out of scope (deferred, logged here per Law 6)

- Gemini CLI hook/observation support (#9 step 4) — needs Gemini-side research.
- Global (`--global`) per-tool install paths.
- Auto-merging an existing `.aider.conf.yml`.

## Verification

1. RED: `src/test/install-targets.test.mts` written first (registry, frontmatter strip, managed-block create/append/replace idempotency, cursor mdc shape, aider conf plan, unknown target) — fails before the lib exists.
2. GREEN: `npm test` (existing suite + new) passes.
3. `npm run verify:all` (12 invariants + typecheck) passes.
4. Manual smoke: run the built installer with `--target gemini,codex` in a temp dir, confirm files + rerun idempotency.
