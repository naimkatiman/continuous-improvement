# [F-29] Meeting Lifecycle Workflow

Status: Backlog
Milestone: v2.12.0 (candidate)
Issue: TBD
Agent: Claude Opus 4.7

## Scope

Create `_workflows/workflow-meeting-lifecycle.md` and `commands/workflow-meeting-lifecycle.md`. a multi-skill workflow that chains the foundation-meeting-* family in realistic sequence: `meeting-brief` + `meeting-agenda` (pre-meeting) → [meeting happens] → `meeting-recap` → `stakeholder-update` (outward comms) + optional `meeting-synthesize` (after multiple related meetings accumulate).

Parallels existing `_workflows/workflow-feature-kickoff.md` pattern (multi-skill chain with explicit step-by-step guidance).

## Problem

The 5 foundation-meeting-* skills ship in v2.11.0 as individually invokable skills. Users can run each one independently but must learn the chain manually: which skill to use when, which artifacts feed which, how filename-based chaining connects them.

A workflow makes the chain discoverable and opinionated. `/workflow-meeting-lifecycle "my meeting topic"` runs the sequence end-to-end (or guides the user through it step-by-step), producing all lifecycle artifacts with consistent frontmatter and auto-discovered cross-references.

## How It Would Work

### Input

- Meeting topic or purpose
- Optional: meeting date/time, attendees, related artifacts
- Optional mode: `interactive` (step-by-step prompt-and-go) or `full-chain` (produce all artifacts in one pass)

### Process (high-level)

1. **Pre-meeting phase**. `/meeting-brief` (private prep) and `/meeting-agenda` (attendee-facing) in parallel
2. **[Real-world gap]**. the meeting happens; workflow pauses
3. **Post-meeting phase**. `/meeting-recap` auto-populates from the agenda artifact
4. **Outward comms phase**. `/stakeholder-update` translates recap for specified audience
5. **Optional synthesis phase**. after N meetings on same topic, `/meeting-synthesize` consumes recaps

Each invocation follows the family contract's go-mode pattern and produces a conforming artifact.

### Output

The full set of lifecycle artifacts for one meeting (brief + agenda + recap + stakeholder-update), filename-chained and with consistent frontmatter.

## Classification

- Type: `workflow` (multi-skill chain, not a standalone skill)
- Directory: `_workflows/workflow-meeting-lifecycle.md`
- Command: `/workflow-meeting-lifecycle`

## Exemplars

- `_workflows/workflow-feature-kickoff.md`. proven multi-skill chain pattern
- `_workflows/workflow-sprint-planning.md`. workflow with real-world pause point (analogous to the pre-meeting vs. post-meeting gap)
- Meeting Skills Family Contract. governs the artifact schemas each workflow step produces

## Deliverables

- `_workflows/workflow-meeting-lifecycle.md`. workflow source file (markdown with chain description and step-by-step instructions)
- `commands/workflow-meeting-lifecycle.md`. slash command registration
- `docs/workflows/workflow-meeting-lifecycle.md`. public workflow doc (auto-generated if generate-workflow-pages.py supports it, else hand-authored)
- `docs/skills/foundation/` cross-references. update each meeting SKILL.md's "Related skills" to reference the workflow
- AGENTS.md workflow registration
- README_WORKFLOWS updates
- Sample output demonstrating full-chain execution on a worked scenario

## Validation

- `validate-commands.sh`: workflow command must reference all 5 meeting skills correctly
- `validate-agents-md.sh`: workflow registered in AGENTS.md
- `validate-meeting-skills-family.sh`: existing validator continues to pass (workflow does not alter member skills)

## Open Questions

- Does a workflow that spans a real-world event (the meeting itself happens outside the workflow) work well in pm-skills' current workflow-doc format? Or does this require a new workflow pattern ("staged workflow" with user-driven resumption)?
- Should the workflow support both `interactive` and `full-chain` modes, or pick one?
- Should the workflow offer to set up calendar integration at the pre-meeting step? Out-of-scope per family contract (calendar is explicit non-goal), but workflows may relax this since they compose across skills.
- Can `pm-skill-builder`'s skill-chain generation help generate the workflow-lifecycle-doc draft? Or is workflow authoring too different from skill authoring?

## Status Transitions

- **Backlog** (current)
- **In Progress**. when workflow authoring begins
- **Shipped**. on v2.12.0 tag + push (or earlier release)

## Rationale for deferral to v2.12.0+

v2.11.0 releases the 5 meeting skills as standalone. Real-world usage data on the skills' chain-in-practice patterns will inform better workflow design than theorizing now. The workflow is a natural v2.12.0 addition once the skills have a usage track record.

## Detailed specification

Deferred. produced during workflow authoring pass.
