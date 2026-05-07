# [F-33] check-sample-standards CI Script

Status: Backlog
Milestone: v2.12.0
Issue: TBD
Agent: Claude Opus 4.7

## Scope

Create a new CI script `scripts/check-sample-standards.sh` + `.ps1` + `.md` that validates `library/skill-output-samples/*/sample_*.md` files against SAMPLE_CREATION.md conventions. Wire into `.github/workflows/validation.yml` as advisory first (2 weeks) then enforcing.

## Problem

SAMPLE_CREATION.md defines the canonical sample standards (filename pattern, thread enum, required sections, fictional-marker discipline, no unresolved placeholders). Nothing enforces it.

Real-world evidence: during the v2.11.0 meeting-skills-family release, the initial 10 samples violated SAMPLE_CREATION.md on three dimensions (wrong thread slot, missing Scenario/Prompt/Output sections, some filename-reference issues inside samples). CI was green because no script checks sample conformance. The gap was caught only by manual pre-release review.

An enforcement mechanism closes the gap: CI fails the build when samples violate standards, so new skills cannot ship with non-conforming samples and existing samples cannot drift without signal.

## How It Works

### What the script checks

For each `library/skill-output-samples/*/sample_*.md` file:

1. **Filename pattern**: matches `sample_{skill-name}_{thread}_{context}.md` where:
   - `{skill-name}` matches the parent directory name
   - `{thread}` is one of `storevine | brainshelf | workbench | orbit | legacy`
   - `{context}` is hyphenated lowercase
2. **Required sections present**: contains `## Scenario`, `## Prompt`, `## Output` (in that order)
3. **No unresolved placeholders**: no `TBD`, `TODO`, `<placeholder>`, `{{...}}` (except legitimately within Output's template-frontmatter which follows `{{...}}` convention. heuristic: only flag placeholders outside fenced code blocks and frontmatter)
4. **Scenario has a Source Notes subsection or inline source reference** (heuristic: not strictly required but advisory)
5. **Fictional-marker discipline**: if any number appears that isn't tagged `[fictional]` and isn't cited to a public source, flag as advisory (LLM-inference-heavy, initially advisory)

### Exit codes

- `0`. all samples pass
- `1`. one or more samples failed (advisory mode: prints failures but exits 0; enforcing mode: exits 1)

### Configuration

- Advisory vs enforcing mode via `CHECK_SAMPLE_STANDARDS_MODE=advisory|enforcing` env var
- Default: advisory for first 2 weeks post-merge, enforcing after

### CI integration

Added to `.github/workflows/validation.yml` as a new step:

```yaml
- name: Check sample standards (bash)
  if: matrix.os == 'ubuntu-latest'
  run: bash scripts/check-sample-standards.sh
  continue-on-error: ${{ vars.SAMPLE_STANDARDS_ADVISORY == 'true' }}
```

Flip `continue-on-error` to `false` (or remove) after 2-week advisory period.

## Classification

- Type: new CI script (no skill; tooling)
- Directory: `scripts/`
- Pattern: `.sh` + `.ps1` + `.md` per script-docs convention

## Exemplars

- `scripts/validate-meeting-skills-family.sh`. cross-skill validator pattern with filename-convention scanning
- `scripts/lint-skills-frontmatter.sh`. per-file linting pattern
- `scripts/check-count-consistency.sh`. advisory-then-enforcing precedent

## Deliverables

- `scripts/check-sample-standards.sh`. bash script
- `scripts/check-sample-standards.ps1`. PowerShell equivalent
- `scripts/check-sample-standards.md`. documentation per `.sh + .ps1 + .md` convention
- `.github/workflows/validation.yml`. new step added (advisory initially)
- `scripts/README_SCRIPTS.md`. entry describing the new script

## Validation

- Dry run against current `library/skill-output-samples/`. confirm it passes after v2.11.0 sample restructure
- Dry run against a known-bad sample (temporarily introduce a placeholder). confirm it catches the violation
- `validate-script-docs.sh`: new script doc conforms to script-doc conventions

## Open Questions

- Should the fictional-marker check be LLM-assisted or rule-based only? Proposal: rule-based only for v1 (regex for plausible-metric patterns without `[fictional]` tag nearby). LLM-assisted check is a v2 enhancement.
- Should the script run on every PR or only on PRs touching `library/skill-output-samples/`? Proposal: every PR (cheap), because samples can drift when non-sample files change their contract (e.g., template updates).
- Exit codes for mixed advisory/enforcing. how to handle a PR that fixes some violations but introduces others? Proposal: fail if NET violations increase; pass if NET decreases (informational "progress mode").

## Status Transitions

- **Backlog** (current)
- **In Progress**. when script authoring begins
- **Advisory shipped**. on v2.12.0 tag
- **Enforcing**. 2 weeks post-v2.12.0 if no false positives surface

## Detailed specification

Deferred. produced during script authoring.
