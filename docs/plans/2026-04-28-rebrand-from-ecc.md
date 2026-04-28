# Rebrand: drop "ECC" abbreviation, use `continuous-improvement` branding

**Date:** 2026-04-28
**Owner:** Naim Katiman
**Status:** in progress

## Why

The "ECC" / "Everything Claude Code" abbreviation is the public branding of `https://github.com/affaan-m/everything-claude-code` (affaan-m's project). This repo (`https://github.com/naimkatiman/continuous-improvement`) currently borrows that branding in 25 source files and one public-facing marketplace manifest, which:

1. Confuses users about provenance and affiliation.
2. Implicitly suggests this repo is a fork or unofficial mirror of affaan-m's project.
3. Advertises with a different project's brand under this repo's marketplace listing.

## Replacement rules (mechanical, brand-preserving)

| Pattern | Replacement |
|---|---|
| `origin: ECC` (frontmatter) | `origin: continuous-improvement` |
| `ECC-native` | `continuous-improvement-native` |
| `ECC` (standalone, brand context) | `continuous-improvement` |
| `ECC 2.0` | `continuous-improvement v2` |
| `the ECC hook` | `the continuous-improvement hook` |
| `ECC helpers` | `continuous-improvement helpers` |
| `adjacent ECC workspaces` | `adjacent continuous-improvement workspaces` |

No "Everything Claude Code" full-form references exist in source, so no full-form replacement is needed.

## Scope (excluding `node_modules/` and historical commit messages)

- `README.md` (1 ref)
- `.cloudplugin/marketplace.json` (2 refs)
- `skills/workspace-surface-audit.md` (22 refs) + plugins mirror
- `commands/workspace-surface-audit.md` (6 refs) + plugins mirror
- `skills/safety-guard.md` (2 refs) + plugins mirror
- `skills/gateguard.md` (1 ref) + plugins mirror
- `skills/strategic-compact.md` (1 ref) + plugins mirror
- `skills/tdd-workflow.md` (1 ref) + plugins mirror
- `skills/verification-loop.md` (1 ref) + plugins mirror
- `skills/wild-risa-balance.md` (1 ref) + plugins mirror
- `skills/proceed-with-claude-recommendation.md` (1 ref) + plugins mirror
- `commands/proceed-with-claude-recommendation.md` (1 ref) + plugins mirror
- `skills/README.md` (1 ref) + plugins mirror
- `docs/plans/2026-04-28-wild-risa-balance-skill.md` (1 ref)

Total: 25 files. The `skill-mirror` lint enforces that `skills/<name>.md` matches `plugins/continuous-improvement/skills/<name>/SKILL.md` byte-for-byte (front-matter aside), so each rename must land in both trees in the same commit.

## Commit split (each commit one concern, ≤15 files)

1. **C1 — Public face**: `README.md` + `.cloudplugin/marketplace.json` (2 files).
2. **C2 — workspace-surface-audit**: skill + command + 2 mirrors (4 files, 28 refs).
3. **C3 — governance skills**: `safety-guard` + `gateguard` + 2 mirrors (4 files).
4. **C4 — workflow skills**: `tdd-workflow` + `verification-loop` + `strategic-compact` + 3 mirrors (6 files).
5. **C5 — meta + plans**: `proceed-with-claude-recommendation` skill + command + `wild-risa-balance` + `skills/README` + 4 mirrors + plan doc (9 files).

## Verification (per commit)

After each commit:

```bash
grep -rn "ECC\b\|Everything Claude Code" --include="*.md" --include="*.json" \
  d:/Ai/continuous-improvement \
  | grep -v node_modules \
  | grep -v "docs/plans/2026-04-28-rebrand-from-ecc.md"
```

Expected: zero hits in the files included in that commit's scope. Remaining hits roll forward into the next commit.

After the final commit, the entire repo (excluding `node_modules` and this plan doc) should produce zero hits.

## Out of scope

- Git commit message history. Old commits with `ECC` in subject lines stay untouched. Rewriting public history is high-blast-radius for negligible benefit.
- Any reference inside `node_modules/`. Vendor code.
- This plan doc itself (which intentionally documents the old term to explain the rebrand).
