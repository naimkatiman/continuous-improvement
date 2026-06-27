# README progressive-disclosure rewrite + discoverability tuning

Date: 2026-06-28
Slug: readme-progressive-disclosure
Supersedes the landing rationale in `docs/plans/2026-05-14-readme-landing-rewrite.md` (structure kept, depth collapsed).

## Task (one sentence)

Make the README easy to scan by keeping the value prop + quick start above the fold and pushing reference depth behind collapsible `<details>` blocks, and lift repo discoverability with research-backed, low-risk metadata fixes.

## Why

A `/deep-research` sweep (6 agents, cited) confirmed:

- The README is the single highest-leverage discovery asset: it is the only repo content Google reliably indexes, it is the rendered npmjs.com landing page, and it is the conversion surface after topic/marketplace discovery ([GitHub Docs — About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)).
- Canonical structure: logo + one-line value prop + ~4 functional badges + copy-paste quick start in the first viewport, then features/usage/config/contributing; keep the scannable surface tight and link out for depth.
- Progressive disclosure: keep the first screen expanded; collapse secondary material (config matrix, troubleshooting, FAQ, long command/skill lists). Collapsed text is still indexed by GitHub code search, so depth is preserved with no SEO loss ([GitHub Docs — collapsed sections](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-collapsed-sections)).
- npm retired its quality/popularity/maintenance scores in Dec 2024; search is now objective word-match relevance + downloads + dependents + recency. The description's first sentence is the surfaced snippet ([GitHub Changelog](https://github.blog/changelog/2024-12-02-announcing-npms-new-simplified-search-experience-ga/)).
- GitHub topics are already 19/20 (not the gap). The About description is the top controllable ranking field and currently carries a grammar bug ("Agents that gets sharper").

## Collapsible render rules (locked, from research)

1. Blank line immediately after every `</summary>` (highest-frequency render bug).
2. Descriptive `<summary>` labels ("Expert install — MCP server + hooks", not "Click here").
3. One flat layer only; never nest `<details>` inside `<details>`.
4. `<details open>` only for must-see-but-long content.

## Invariants the rewrite MUST preserve (CI gates)

Verbatim tokens that must remain somewhere in `README.md` (collapsed content counts — checks read raw file text):

- `If you don't know which to pick, use Beginner.` (docs-substrings)
- `planning-with-files`, `task_plan.md`, `ci_plan_init` (docs-substrings)
- `27 skills`, `1 core + 1 featured + 6 tier-1 + 16 tier-2 + 3 always-bundled`, `28th skill` (skill-count-prose)
- Any line containing "physically block" / "PreToolUse hook" / "runtime gate" needs a `hooks/<name>.mjs` reference within ±5 lines (doc-runtime-claims).

`README.md` is NOT part of the `plugins/` mirror and does not feed `verify:generated`, so this change is isolated.

## Plan

1. Branch `docs/readme-progressive-disclosure` off clean `main`. (done)
2. This plan doc. (done)
3. Rewrite `README.md`:
   - Above the fold: hero GIF, H1, value prop, ~5 functional badges (swap the static "tests passing" vanity badge for a real npm-downloads badge), New-here pointer, copy-paste quick start + the Beginner decision rule.
   - Keep expanded: What this does (3 layers), See it in action (before/after), The 7 Laws table + loop diagram, Skills one-liner, GitHub Action, More/links.
   - Collapse behind `<details>`: Who this is for, The problem this solves (5-mode table), How enforcement works, Expert install, Troubleshooting, Operator modes, Works with other agents, Mulahazah, Slash commands, Uninstall, Brand stack, In the wild.
4. `npm run verify:all` green (content invariants + typecheck).
5. Commit (cite this plan), push, open PR.
6. Direct (not git): fix the GitHub About description via `gh repo edit` to a keyword-led, grammatical, readable string.

## Deferred to a follow-up (logged, not dropped)

- npm `keywords` + first-sentence `description` tuning in `package.json` — feeds generated manifests, so it carries a `verify:generated` blast radius; ship as its own single-concern PR.
- Social preview image (1280×640 PNG <1MB) — must be uploaded in repo Settings UI; no API.
- Submit to community awesome-lists / Claude Code marketplaces for backlinks + star velocity.

## Verification

`npm run verify:all` must print OK for skill-count-prose, docs-substrings, doc-runtime-claims, and typecheck (plus the other 10 invariants unaffected). No "should work" — paste the passing output.
