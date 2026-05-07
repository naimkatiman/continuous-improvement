# [F-17] Foundation Meeting Synthesize Skill

Status: Backlog
Milestone: v2.11.0
Issue: TBD
Agent: Claude Opus 4.7

> **History note**: This effort replaces the original F-17 "meeting-synthesis" scope (archived at `docs/internal/_NOTES/archived-efforts/2026-04-17_F-17-meeting-synthesis-original.md`). The original was narrowly scoped as a single-meeting extractor. The new scope is cross-meeting synthesis. the archaeology skill. Salvaged content (meeting type taxonomy, Krisp MCP reference, multi-meeting concept) informs the expanded design. Single-meeting extraction responsibility moves to `foundation-meeting-recap` (F-27).

## Scope

Create `foundation-meeting-synthesize`, a cross-meeting analysis skill that consumes multiple meeting recaps or raw meeting outputs over a period and surfaces patterns invisible in any single meeting: how decisions evolved, who has been saying what, where threads are stalling, where contradictions have emerged. The archaeology skill. Conforms to the [Meeting Skills Family Contract](../reference/skill-families/meeting-skills-contract.md).

## Problem

PMs working on multi-meeting initiatives lose the arc. Decisions made in meeting 1 drift in meeting 3; a stakeholder's position shifts by meeting 5 and nobody flags the contradiction until it surfaces in a senior review. "What have we decided about search scope over the last quarter?" takes a half-day of rereading recaps, and even then, the synthesis is brittle. a different reader, or the same reader a week later, produces a different narrative.

The skill converts a set of recaps (and optionally raw notes for meetings that lack a recap) into a structured synthesis artifact: a plain-text timeline, themes with confidence markers, stakeholder position tracking, a consolidated decision list, contradiction flags, open items/stalled threads, a narrative summary, and prioritized follow-up suggestions. Output is designed for board prep, onboarding docs, project retro input, or exec briefings.

Positioned distinctly from `discover-interview-synthesis`: that skill works on user research conversations with research-specific frameworks (jobs-to-be-done, buying insights). This skill works on internal org meetings with org-specific patterns (stakeholder alignment, decision evolution, project history).

## How It Works

### Input

- Multiple recap filenames (preferred. structured input produces higher-confidence synthesis)
- Raw notes for meetings without recaps (accepted. skill produces best-effort synthesis with `input_quality: medium` or `low` flag)
- Time range: quarter, explicit date range, or "all meetings on topic X"
- Optional scope filter: specific topic, project, or set of stakeholders
- Optional output format hint: board-prep, onboarding, retro-input, exec-brief

### Process

1. **Load sources**. recaps primarily, notes secondarily. Log per-source input quality.
2. **Present go-mode inference summary**. meeting count, time range, scope filter applied, sources with quality levels. Per family contract.
3. **Build plain-text timeline**. chronological key events and decisions, rendered as markdown (no binary images)
4. **Extract themes**. recurring topics, tensions, language patterns. Confidence per theme based on frequency (e.g., "appears in 5/5 meetings" → high; "mentioned in 1 meeting" → low)
5. **Track stakeholder positions**. per key stakeholder, position evolution from initial to current; alignment state (aligned / divergent / shifting)
6. **Consolidate decisions**. all decisions across meetings, sorted chronologically, with source meeting citations
7. **Flag contradictions**. decisions or positions in conflict. The highest-value archaeology output; dedicated section with before/after citations
8. **Identify open items and stalled threads**. unresolved questions that keep resurfacing without resolution
9. **Draft narrative summary**. the "story" of this meeting set in 2-3 paragraphs
10. **Prioritize follow-up suggestions**. High / Medium / Low with rationale and suggested owner or forum
11. **Produce artifact** conforming to TEMPLATE.md

### Output

Multi-section synthesis document. Shareable summary block at top (scope, headline takeaway, key themes, top open items, top priority follow-ups). Full synthesis below with scope section, plain-text timeline, themes with confidence markers, stakeholder position tracking, consolidated decision list, contradiction flags, open items, narrative summary, prioritized follow-ups. Sources & References section listing every source meeting with filename and input quality.

## Classification

- Type: `foundation` (cross-phase; synthesis is meta-work applicable to any initiative)
- Category: `meeting`
- Directory: `skills/foundation-meeting-synthesize/`
- Command: `/meeting-synthesize`

## Exemplars

- `discover-interview-synthesis`: sibling-but-distinct pattern for extracting structured insights from conversation sets (different domain, same rigor)
- `foundation-meeting-recap` (F-27): primary input source; synthesis consumes recaps
- Meeting Skills Family Contract: shared behavioral and structural requirements
- Archived F-17 original: meeting type taxonomy, Krisp integration note, multi-meeting synthesis concept (salvaged)

## Deliverables

- `skills/foundation-meeting-synthesize/SKILL.md`
- `skills/foundation-meeting-synthesize/references/TEMPLATE.md`
- `skills/foundation-meeting-synthesize/references/EXAMPLE.md` (worked example: quarterly synthesis of search-feature meetings)
- `commands/meeting-synthesize.md`
- `library/skill-output-samples/foundation-meeting-synthesize/sample_foundation-meeting-synthesize_*.md` (3 samples: quarterly topic synthesis, project-retro synthesis, exec-review-sequence synthesis for board prep)
- `docs/skills/foundation/foundation-meeting-synthesize.md`
- AGENTS.md entry and commands-table row
- README_SAMPLES.md count updates and browse-table entries
- mkdocs.yml Foundation nav entry

## Validation

- `lint-skills-frontmatter.sh`: must PASS
- `validate-agents-md.sh`: must PASS
- `validate-commands.sh`: must PASS
- `validate-meeting-skills-family.sh`: must PASS
- `check-count-consistency.sh`: advisory

## Open Questions

- Topic and stakeholder filtering UX. is filtering a parameter at invocation or a post-generation narrowing? Decide during spec writing. Prefer at invocation for predictability.
- Export formats for specific uses (board prep, onboarding doc, project retro input). single output format with mode hints, or separate `--format` variants? Decide during spec writing.
- Sentiment or tension tracking. how has tone on this topic shifted over time? Deferred; not in v1.0.0.
- Gap detection. flag when an active topic has gone dark for N meetings? Consider during spec writing.
- Role-aware filtering ("synthesize only what engineering said"). deferred; not in v1.0.0.

## Status Transitions

- **Backlog** (current)
- **In Progress**. when per-skill authoring begins
- **Shipped**. on v2.11.0 tag + push

## Detailed specification

See [`F-17-meeting-synthesize/specification.md`](F-17-meeting-synthesize/specification.md) for the full spec.
