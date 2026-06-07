# 2026-06-07 — Intelligence-amplifier reframe (motto realignment)

## Goal

Realign continuous-improvement's identity from a **discipline/seatbelt** framing to a
**higher-intelligence / higher-effectiveness amplifier** framing, across every user-facing
surface. Operator's words: *"the goal of continuous-improvement is give Claude Code higher
intelligence and higher effectiveness instead of focusing on efficiency... this is the motto,
not give Claude Code a seatbelt."*

Operator decisions (asked up front):
- **Scope:** both story (positioning/copy) and capability (real behavior, not just relabeling).
- **Execution:** autonomous — research, plan, ship; no approval gate before edits.
- **7 Laws brand:** keep the names, reframe each Law from a restriction into a capability the
  agent gains. "The 7 Laws of AI Agent Discipline" stays as a sub-brand; "Discipline" is no
  longer the headline.

## The smoking gun

The rejected framing is the loudest copy in the repo, not subtext:
- `README.md:7` — `<h1>A seatbelt for Claude Code</h1>`
- `docs/landing/index.html` — `<title>`, OG, Twitter cards all "A seatbelt for Claude Code";
  hero `<h1>` "A seatbelt for Claude Code"; CTA "Put a seatbelt on your agent."; a `.belt`
  CSS motif animating the wordplay.
- `src/lib/plugin-metadata.mts` `SHARED_PLUGIN_DESCRIPTION` — "Stops Claude Code from skipping
  research, claiming 'done' without verifying, and repeating yesterday's mistakes." (fans out
  to package.json + the three generated manifests).
- `llms.txt` — "A discipline framework... It enforces seven laws".

## Source-of-truth chain (what's source vs generated)

- `SHARED_PLUGIN_DESCRIPTION` in `src/lib/plugin-metadata.mts` is the canonical description. It
  is NOT read from package.json — it is hardcoded. `npm run build` (= `tsc` then
  `bin/generate-plugin-manifests.mjs`) propagates it to the three generated manifests
  (`.claude-plugin/marketplace.json`, `plugins/continuous-improvement/.claude-plugin/{plugin,marketplace}.json`).
- `npm run build` **`rm`s and fully regenerates** `plugins/continuous-improvement/` — it copies
  root `SKILL.md`, `skills/*.md`, `commands/*.md`, `hooks/*`, etc. into the mirror tree. So the
  plugin mirrors are NEVER hand-edited; edit flat source, rebuild, commit both. `verify:skill-mirror`
  / `verify:everything-mirror` byte-compare to catch a forgotten rebuild.
- Hand-maintained mirrors (build does NOT regenerate): `package.json` description, `llms.txt`,
  `README.md`, `QUICKSTART.md`, `CONTRIBUTING.md`, `docs/landing/index.html`.

## Invariants threaded (must-preserve)

- `verify:skill-count` — literal `25 bundled skills` (regex `(?<!\d)25 bundled skills`) in
  marketplace.json, plugin.json, package.json, llms.txt. Reword around it; keep the token.
- 7 Law NAMES are pinned (skill.test/commands.test/community.test via check-docs-substrings):
  Research Before Executing / Plan Is Sacred / One Thing at a Time / Verify Before Reporting /
  Reflect After (SKILL) + "Reflect After Sessions" (discipline.md/llms) / Iterate (SKILL) +
  "Iterate One Change" (discipline.md/llms) / Learn From Every Session. Do NOT homogenize the
  three files' law wording.
- `verify:doc-runtime-claims` — README/QUICKSTART/skills lines containing "physically block" /
  "PreToolUse hook" / "runtime gate" need a `hooks/<name>.mjs` ref within +/-5 lines. Keep the
  factual gateguard mechanics + their anchors; only recast the surrounding lead.
- Em-dash (U+2014): keep `Iteration — Next best recommendations (ranked, top 3)` and the
  `— 25 bundled skills`-style boundaries intact.
- Pinned README substrings: `If you don't know which to pick, use Beginner.`,
  `planning-with-files`, `task_plan.md`, `ci_plan_init`.
- Do NOT touch per-skill `Enforces Law N (...)` frontmatter (verify:skill-law-tag).

## Chosen copy

- Headline (README h1 + landing hero): **"Claude Code that gets sharper every session"**
- Tagline: "Claude gets sharper every session — reasons deeper, recalls past fixes, and keeps
  what worked."
- Description (SHARED_PLUGIN_DESCRIPTION): "Makes Claude Code reason harder, recall past
  corrections, and learn from every session so its competence compounds run over run. The
  Mulahazah engine turns each fix into a reusable instinct, so a lesson learned once is applied
  automatically next time — no re-teaching. Built on the 7 Laws of AI Agent Discipline
  (research, plan, verify, reflect, learn) and shipped as 25 bundled skills, instinct-aware
  hooks, an MCP toolset for recall and reflection, and a GitHub Action transcript linter that
  feeds real work history back into sharper instincts."
- 7 Laws reframed as amplifiers (names preserved) — see README `## The 7 Laws` table.

## Honesty guardrail

No over-claiming beyond shipped mechanics: recall is BM25/lexical (not semantic), distillation
drafts never auto-apply, instincts decay and need reinforcement, gateguard genuinely blocks
(framed as "forces grounding -> smarter edits", not deleted). All copy stays inside these truths.

## Files (PR1 — reframe)

Flat source (hand-edited): `src/lib/plugin-metadata.mts`, `package.json`, `llms.txt`,
`README.md`, `SKILL.md`, `CONTRIBUTING.md`, `docs/landing/index.html`.
Generated (via `npm run build`, committed): `lib/plugin-metadata.mjs`, the three manifests,
`plugins/continuous-improvement/**` mirror tree.

## Verification

`npm run verify:all` (11 invariants + typecheck) must pass green. Baseline was green before edits.

## PR split (no bundled concerns)

- **PR1 (this plan):** the reframe across all surfaces + this plan doc + capability roadmap.
  One concern: identity/positioning.
- **PR2 (separate, TDD):** the capability increment — a SessionStart "recall briefing" hook that
  auto-runs `ci_recall` on the first prompt and injects the top-3 prior hits, making episodic
  memory proactive. Real behavior change -> RED-GREEN-REFACTOR, own PR.

  > **Shipped (PR #199) — superseded shape:** PR2 landed as a **UserPromptSubmit** hook that queries the BM25 recall index **in-process** on the first substantive prompt — not a `SessionStart` hook, and not by spawning `ci_recall`. Opt-in via `CLAUDE_RECALL_BRIEFING=1` (default off). See `docs/plans/2026-06-07-recall-briefing-hook.md`.

## Capability roadmap (ranked, for follow-up PRs)

1. SessionStart recall briefing (PR2 — recommended increment).
2. Auto-draft distillation at the Stop boundary (ci_distill_candidates -> drafts).
3. Reflect-to-instinct bridge (ci_reflect emits a candidate instinct).
4. Recall hits inside the gateguard block (pre-load the forced investigation).
5. Cross-project instinct suggestion on a new project.
6. Semantic recall (embedding index alongside BM25).
7. goal-coach amplifier skill (adds a skill -> defer until a count bump is intended).

## Deferred

- Keyword `ai-discipline` in `KEYWORDS` (plugin-metadata.mts) + package.json keywords still
  encodes the old framing. Left as-is for PR1 (honest: the engine is still discipline-based);
  an intelligence-forward keyword swap is a separate decision (touches the KEYWORDS source const
  -> propagates to manifests).
- Release/version bump + npm publish + landing deploy are operator actions, not part of this PR.
