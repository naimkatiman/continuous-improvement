# 2026-06-08 — Reposition copy under the orchestration layer

## Goal

Move continuous-improvement's positioning off the "intelligence amplifier / reason
harder" framing (shipped 2026-06-07) and onto **"the persistent-memory and
runtime-discipline layer for Claude Code."** Opus 4.8 shipped native Workflow
orchestration + ultracode, which already owns the "reason harder via multi-agent
depth" claim. The defensible, non-commoditized differentiators are cross-session
memory (recall + Mulahazah instincts) and runtime enforcement (gateguard) — things
an in-turn orchestration primitive structurally cannot provide.

## Decision

- Keep the headline **"Claude Code that gets sharper every session"** — it already
  encodes cross-session compounding, the durable promise. Not a collision.
- Keep "The 7 Laws of AI Agent Discipline" as the sub-brand; keep Mulahazah.
- Pivot only the supporting copy that leaned on raw-reasoning claims
  ("reason harder/deeper", "intelligence amplifier", "reasons at a higher level").
- Add one wedge line in llms.txt: "Orchestration tools run a task; this is the
  layer that makes the lessons survive the run." Positioning contrast only — NOT a
  claim of an ultracode/Workflow integration (none is built; that is PR2).

## Honesty guardrail

No over-claiming. Recall is BM25/lexical; instincts decay and need reinforcement;
gateguard genuinely blocks. The orchestration contrast is positioning, not an
integration claim.

## Files (hand-edited source)

- src/lib/plugin-metadata.mts — SHARED_PLUGIN_DESCRIPTION (canonical; npm run build
  propagates to the three manifests + lib mirror).
- package.json — description (hand-maintained; the generator does not write it).
- llms.txt — blockquote mirror + "What This Is" + orchestration wedge.
- README.md — subtitle bold line.
- docs/landing/index.html — meta description + "the seven laws" sec-head h2/p.
- .cloudplugin/marketplace.json — description (hand-maintained; build does not
  regenerate it).

## Generated (via npm run build, committed)

.claude-plugin/marketplace.json, plugins/continuous-improvement/.claude-plugin/{plugin,marketplace}.json,
lib/plugin-metadata.mjs + plugin lib mirror.

## Invariants preserved

- verify:skill-count — "25 bundled skills" literal kept in every description surface.
- 7-Law names, verify:doc-runtime-claims gateguard anchors, the README install
  decision rule, planning-with-files / task_plan.md / ci_plan_init — all untouched.

## Verification

npm run verify:all (12 invariants + typecheck) green.

## Deferred

- .cloudplugin/marketplace.json version is stale (3.12.0 vs package 3.12.3) —
  pre-existing, out of scope for a copy PR; bump in a release/version PR.
- Explicit "CI x ultracode" wedge on the public landing page (a sharper, named
  contrast) — deferred to operator review. PR1 only de-collides; it adds no
  ultracode-named section.
- PR2: Workflow-run -> instinct bridge (Stop-boundary distiller turning a completed
  native Workflow run into a persisted Mulahazah instinct) — the real integration;
  separate TDD PR.
- Release/version bump + npm publish + landing deploy are operator actions.

## Tension acknowledged

This partially walks back the operator's 2026-06-07 "higher intelligence /
effectiveness" motto. Surfaced in the audit that preceded this PR; operator
approved the repositioning ("yes, copy first"). The motto's intent (capability,
not seatbelt-restriction) is preserved — persistent memory and grounded edits are
capabilities, framed as such.
