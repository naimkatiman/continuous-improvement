# Plan — Canonical GateGuard clearance + in-harness clearance action

- Date: 2026-06-07
- Status: Spec approved (design sign-off given); implementation NOT started
- Owner: gateguard
- Follows: PR #193 (block reason now prints the exact state-file path and stops instructing the impossible inline flag). This plan removes the remaining fragility.
- Scope decision (confirmed): root-cause canonicalization **plus** a clearance action.
- Surface decision (confirmed): **both** an MCP tool (`ci_gateguard_clear`) and a Bash CLI (`bin/gateguard-clear.mjs`).

## Problem (root cause)

GateGuard's per-session clearance state is addressed two ways, both sensitive to path *form*:

1. **Session dir** = `~/.claude/instincts/<hash>/`, `hash = sha256(projectRoot).slice(0,12)`.
2. **Per-file keys** = the raw `tool_input.file_path` string under `cleared_files`.

`projectRoot` is resolved differently by different processes:

- The hook (`src/lib/gateguard-state.mts::resolveSessionDir`) uses `CLAUDE_PROJECT_DIR` first — on this host that was `d:/Ai/continuous-improvement` (lowercase drive) → `86cc9a542a7a`.
- The MCP server (`src/bin/mcp-server.mts::getProjectHash`) uses `git rev-parse --show-toplevel` — which returned `D:/Ai/continuous-improvement` (uppercase drive) → `38c17ae973a4`.

Different string → different hash → **different dir**. Likewise file keys differ by drive-letter case and separator (`d:\x`, `D:/x`, …). A clearance written by one process is invisible to the hook, which is why clearing the gate today requires shotgun-seeding every path variant across several candidate dirs by hand (observed live while shipping PR #193).

## Goals / non-goals

Goals:
- The hook and every clearance helper resolve the **same** session dir and match the **same** file key, regardless of drive-letter case, separator, or which env var supplied the root.
- A first-class, in-harness way to clear the gate after presenting facts — usable in beginner mode (the gate fires for all users) and without the MCP server connected.
- No change to the gate's *intent*: first mutation per file still blocks; clearance is still honor-system; the 50-file cap still bounds damage.

Non-goals:
- Verifying that investigation actually happened (still honor-system; out of scope).
- Removing the `_gateguard_facts_presented` inline flag (kept for harnesses that forward unknown tool params; tests depend on it).
- Persisting clearance across sessions (still ephemeral).

## Design

### 1. One shared canonicalizer (`src/lib/gateguard-state.mts`)

Add two pure, total functions (never throw):

- `canonicalizeProjectRoot(p: string): string` — if `p` matches `^[A-Za-z]:` lowercase the drive letter; convert `\` → `/`; strip a trailing `/`. POSIX/relative paths pass through unchanged.
- `canonicalizeFileKey(p: string): string` — same normalization, applied to every file path before it is stored or looked up. Relative keys (e.g. `scratch.txt`, used throughout the existing tests) contain no drive letter and no `\`, so they are a **no-op** — existing tests keep matching.

Wire them in:
- `resolveSessionDir()` hashes `canonicalizeProjectRoot(projectRoot)` (applied to both the `CLAUDE_PROJECT_DIR` and the git-toplevel branches).
- `markFileCleared(state, filePath)` stores under `canonicalizeFileKey(filePath)`.
- New `isFileCleared(state, filePath): boolean` → `canonicalizeFileKey(filePath) in state.cleared_files`. Single lookup shared by the hook and any helper.
- New `clearFiles(sessionDir, filePaths: string[]): { cleared: string[]; skippedForCap: string[] }` — load → for each canonical key not already present, add if under `MAX_CLEARED_FILES`, else push to `skippedForCap` → save only if something changed. The one writer shared by the MCP tool and the CLI.

### 2. Hook (`src/hooks/gateguard.mts`)

- Replace the inline `path in state.cleared_files` checks in `alreadyCleared` / `firstUnclearedFilePath` with `isFileCleared(...)` so lookups are canonical.
- Block reason: keep the printed state-file path (PR #193); add one line naming the clearance action, e.g. `Clear it: ci_gateguard_clear {file_paths:["<path>"]}  —or—  node "${CLAUDE_PLUGIN_ROOT}/bin/gateguard-clear.mjs" "<path>"`.
- No change to routing, destructive-bash, or cap logic.

### 3. MCP tool `ci_gateguard_clear` (`src/bin/mcp-server.mts` + `src/lib/plugin-metadata.mts`)

- Definition added to `BEGINNER_TOOL_ENTRIES` (so it appears in **both** beginner and expert catalogs — the gate fires for all users).
- Schema: `{ file_paths: string[] }` (required; accept a single string too by coercing). Returns which paths were cleared, which were skipped for the cap, and the resolved state-file path for transparency.
- Handler resolves the dir via gateguard-state's `resolveSessionDir()` — **not** the server's own `getProjectHash()` — so it agrees with the hook. Reuses `clearFiles`.
- Not expert-gated (unlike most `ci_*` tools).

### 4. CLI `bin/gateguard-clear.mjs` (`src/bin/gateguard-clear.mts`, new)

- `node bin/gateguard-clear.mjs <file_path> [<file_path>...] [--state <path>]`.
- Default: resolve via `resolveSessionDir()` (canonical) and `clearFiles`.
- `--state <path>`: write that exact state file (the path the block reason prints) — zero resolution, belt-and-suspenders for any residual env mismatch.
- Runs via the hook-allowed Bash route (Bash is gated only on destructive patterns). Prints cleared/skipped summary; exit 0 on success, non-zero on usage error.
- `tsconfig` (`rootDir: src`, `outDir: .`) maps `src/bin/gateguard-clear.mts` → `bin/gateguard-clear.mjs`; the everything-mirror build copies it to `plugins/continuous-improvement/bin/gateguard-clear.mjs`.

### Data flow

Gate blocks first Write/Edit → reason prints the state path + clearance command → agent presents facts → calls `ci_gateguard_clear` (MCP) or runs the CLI (Bash) → shared `clearFiles(resolveSessionDir(), …)` writes canonical markers in the canonical dir → agent retries → hook canonicalizes the incoming path via `isFileCleared`, matches, allows.

### Error handling

- Empty / non-array `file_paths` → usage error (tool returns `isError`, CLI exits non-zero).
- Cap reached → paths reported under `skippedForCap`; message mirrors `buildCapReachedReason`.
- `--state` path unwritable → error.
- Canonicalizers are pure/total; relative + POSIX paths are no-ops.

### Migration / backward-compat

Canonicalizing the hash changes the session dir once for any project whose `CLAUDE_PROJECT_DIR`/git-toplevel was not already canonical. Existing markers in the old dir are orphaned → at worst a one-time re-block per file in an active session (clearances are ephemeral; no persistent data). The variant keys seeded by hand during PR #193 become moot, harmless. No schema change to `gateguard-session.json`.

## Public API surface (new/changed exports)

`src/lib/gateguard-state.mts`:
- `+ canonicalizeProjectRoot(p): string`
- `+ canonicalizeFileKey(p): string`
- `+ isFileCleared(state, filePath): boolean`
- `+ clearFiles(sessionDir, filePaths): { cleared, skippedForCap }`
- `~ resolveSessionDir` / `markFileCleared` now canonical (no signature change)

`src/lib/plugin-metadata.mts`:
- `+ ci_gateguard_clear` entry in `BEGINNER_TOOL_ENTRIES`

`src/bin/mcp-server.mts`:
- `+ case "ci_gateguard_clear"` using `resolveSessionDir` + `clearFiles`

`src/bin/gateguard-clear.mts` (new) → `bin/gateguard-clear.mjs`

## Phased implementation plan (TDD, one concern per commit per layer)

**Phase 0 — confirm the three risks (no code).**
- Read `src/test/mcp-server.test.mts`: exact per-mode tool-count assertions + `tools/list` membership shape.
- `grep` docs/README for tool-count strings the `verify:docs-substrings` lint pins (beginner "3 tools" / expert counts).
- Decide single vs array param final shape from how other tools coerce.

**Phase 1 — lib canonicalization (RED→GREEN).**
- `src/test/gateguard-state.test.mts` (extend or add): unit tests for both canonicalizers (drive-case, `\`→`/`, trailing slash, relative no-op, POSIX no-op); `resolveSessionDir` canonical; `markFileCleared` stores canonical; `isFileCleared` matches across forms; `clearFiles` writes + respects cap.
- Implement in `gateguard-state.mts`. Build + run suite.

**Phase 2 — hook uses canonical lookup (RED→GREEN).**
- Extend `src/test/gateguard-hook.test.mts`: a file cleared as `D:/x` is allowed when the hook receives `d:\x`; existing relative-path tests stay green. Add block-reason assertion naming the clearance action.
- Update `src/hooks/gateguard.mts`. Build.

**Phase 3 — MCP tool (RED→GREEN).**
- Extend `src/test/mcp-server.test.mts`: `ci_gateguard_clear` present in beginner + expert `tools/list`; clears markers in `resolveSessionDir()` dir; returns cleared/skipped; cap behavior; bump the per-mode count assertions (beginner 3→4, expert 17→18 — verify in Phase 0).
- Add the entry to `plugin-metadata.mts` and the handler to `mcp-server.mts`. Build (regenerates manifests).

**Phase 4 — CLI (RED→GREEN).**
- New `src/test/gateguard-clear.test.mts`: clears via `resolveSessionDir`; `--state` override writes the named file; multi-path; cap; usage error. (Spawn the built `.mjs` like the hook test does.)
- Add `src/bin/gateguard-clear.mts`. Build (emits `bin/gateguard-clear.mjs` + bundle mirror).

**Phase 5 — docs + changelog (mirror-safe).**
- Both skill `.md` copies (`skills/gateguard.md` + `plugins/.../SKILL.md`, byte-identical): document the clearance action and the canonical-key behavior; update the "Honor system" note.
- Any docs/README tool-count strings flagged in Phase 0.
- `CHANGELOG.md` `[Unreleased]`.

## Verification

- `npm run build` after every `.mts` edit (rebuild-before-stage; `.mjs` are generated).
- `npm run verify:all` green: skill-mirror, everything-mirror (new `bin/*.mjs` + bundle copy), routing-targets, doc-runtime-claims, docs-substrings (tool counts), typecheck.
- Full test suite green; specifically the gateguard-state, gateguard-hook, mcp-server, and new gateguard-clear suites.
- Manual: trip the live gate, run `ci_gateguard_clear` and the CLI, confirm retry is allowed without hand-seeding any dir.

## Rollout / deploy

- Ship via a feature branch + PR off `origin/main` (never direct to main).
- Global host deploy (per the PR #193 pattern): after merge, refresh the plugin so the cache picks up the new `gateguard.mjs`, `mcp-server.mjs`, and `bin/gateguard-clear.mjs`. Because the cache only refreshes on a version bump, decide at PR time whether to cut a patch version or hot-patch the cache for immediate effect.

## Risks & open questions

- **Tool-count assertions** (Phase 0) — `mcp-server.test.mts` and `verify:docs-substrings` pin counts; both must move together or the gate fails.
- **MCP server env** — if the server process lacks `CLAUDE_PROJECT_DIR`, its git-toplevel branch must still canonicalize to the hook's dir; the `--state` override and canonicalization both de-risk this, but Phase 3 should assert the resolved dir equals the hook's for the same project.
- **Param shape** — `file_paths: string[]` vs single `file_path`; coerce a lone string to a one-element array to be forgiving.
- **Cap semantics on partial clear** — clearing a MultiEdit batch that straddles the cap clears some and reports the rest; the agent must see which were skipped (already in the return shape).
