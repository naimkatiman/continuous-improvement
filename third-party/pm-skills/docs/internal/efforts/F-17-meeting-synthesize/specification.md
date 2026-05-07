# F-17 foundation-meeting-synthesize: Specification

Reads together with:
- Effort brief: [`../F-17-meeting-synthesize.md`](../F-17-meeting-synthesize.md)
- Family contract: [`docs/reference/skill-families/meeting-skills-contract.md`](../../../reference/skill-families/meeting-skills-contract.md)
- Implementation plan: [`plan_meeting-synthesize.md`](plan_meeting-synthesize.md)

## Input contract

| Input | Required? | Accepted forms | Default |
|-------|-----------|----------------|---------|
| Source meetings | Yes | List of recap filenames (preferred) or raw note files |. |
| Time range | No | `--quarter=2026-Q1`, `--range=YYYY-MM-DD-to-YYYY-MM-DD`, or "last quarter" / "last month" | All sources provided |
| Topic filter | No | String (matches `project` or `topics` in source frontmatter) | None |
| Stakeholder filter | No | List of names | None |
| Output format hint | No | `board-prep` / `onboarding` / `retro-input` / `exec-brief` | `default` (full synthesis) |

## Inference rules

| Value | Inferred from | Confidence rule |
|-------|---------------|-----------------|
| Themes | Topic recurrence, language pattern matching across sources, stakeholder alignment | High when appears in N/N meetings; medium when N-1/N or 2/N+; low when 1/N |
| Stakeholder position evolution | Quoted/paraphrased positions across meetings; chronological ordering | High when direct quotes available; medium when paraphrased; low when inferred |
| Contradictions | Decision A at time T conflicts with Decision B at time T' | High when explicit wording conflict; medium when semantic conflict; always flag |
| Stalled threads | Topics surfaced 2+ times without resolution | Medium-to-high based on recurrence count |
| Prioritization for follow-ups | Stalled status + stakeholder impact + time since last surface | Medium; explicit rationale per recommendation |

## Process (detailed)

1. **Load sources**. read all provided files; parse frontmatter; note per-source input quality
2. **Apply filters**. if time range, topic, or stakeholder filter provided, narrow source set
3. **Present go-mode inference summary**. per contract; includes meeting count after filter, time range detected, per-source quality levels, scope filter applied
4. **Build plain-text timeline**:
   - Chronological order by `meeting_date`
   - Each entry: date | meeting name | key decision or shift | confidence / contradiction flag
   - Rendered as markdown (no binary images)
5. **Extract themes**:
   - Cluster recurring topics across sources
   - For each theme: description, sources where it appeared, confidence marker ("appears in X/Y meetings")
6. **Track stakeholder positions**:
   - For each named stakeholder across sources: initial position → current position
   - Alignment state: aligned / divergent / shifting
   - Key quoted or paraphrased statements with dates
7. **Consolidate decisions**. all decisions across meetings, sorted chronologically, with source meeting citations. Table format with columns: Date | Decision | Context | Meeting | Confidence
8. **Flag contradictions**. pairs of decisions or positions in conflict:
   - Earlier reference + later reference
   - Status: unresolved / later supersedes / needs reconciliation
9. **Identify open items and stalled threads**. topics resurfacing without resolution; when they last appeared
10. **Draft narrative summary**. 2-3 paragraphs: what happened, what changed, where we are, what's at stake
11. **Prioritize follow-up suggestions**:
    - High: unblocking now; suggested owner/forum
    - Medium: important but not blocking
    - Low: monitor
    - Each with rationale
12. **Apply format hint** (if provided):
    - `board-prep`: lead with narrative + contradictions + prioritized follow-ups; shorter timeline
    - `onboarding`: lead with narrative + stakeholder tracking; full timeline
    - `retro-input`: lead with themes + stalled threads + meeting quality aggregate
    - `exec-brief`: TL;DR + top 3 items only
13. **Render TEMPLATE.md**

## Output contract

**Frontmatter** (replaces single-meeting fields):

```yaml
artifact_type: meeting-synthesis
source_meetings:
  - 2026-01-15_14-00EST_search-scope-kickoff_recap.md
  - 2026-02-05_14-00EST_search-scope-review_recap.md
  - 2026-03-12_14-00EST_search-capacity-decision_recap.md
time_range:
  start: 2026-01-01
  end: 2026-03-31
scope_filter: "project=search-feature"
project: search-feature
topics:
  - scope
  - capacity
  - timeline
input_quality: high  # weighted across sources
confidence: high
```

Omits `meeting_title`, `meeting_date`, `meeting_start_time`, `attendees` (aggregated, not per-meeting).

**Required sections** in order:

1. Title ("Meeting synthesis: {topic/initiative}")
2. `## Shareable summary` (scope + headline takeaway + key themes + top open items + top follow-ups)
3. `## Full synthesis`
   - Scope (topic, time range, meetings included with input quality per source, scope filter, sources used)
   - Timeline (plain-text markdown-rendered chronological)
   - Themes (with per-theme confidence markers and manifestation per meeting)
   - Stakeholder position tracking (per stakeholder: evolution, key statements, alignment state)
   - Consolidated decision list (chronological table)
   - Contradiction flags (the highest-value archaeology output)
   - Open items and stalled threads
   - Narrative summary (2-3 paragraphs)
   - Prioritized follow-up suggestions (High / Medium / Low)
4. `## Sources & References`. every source meeting with filename + date + input quality

## Sample inventory

| Sample | Scenario | Purpose |
|--------|----------|---------|
| `sample_foundation-meeting-synthesize_quarterly-topic.md` | Q1 search-feature synthesis across 8 meetings | Demonstrates full default output with timeline, themes, contradictions |
| `sample_foundation-meeting-synthesize_project-retro.md` | Project retrospective synthesis across 6 project meetings | Demonstrates `retro-input` format with aggregated meeting quality signals |
| `sample_foundation-meeting-synthesize_exec-board-prep.md` | Exec-review-sequence synthesis for board prep | Demonstrates `board-prep` format with TL;DR-forward narrative |

## Design decisions

1. **Plain-text timeline, not binary image**. renders everywhere (chat, email, PRs, printed). Markdown-compatible code block with date | event | shift structure. Binary images break in too many downstream contexts.
2. **Contradiction flags are a first-class section, not an afterthought**. this is the synthesis output that no human reviewer catches reliably. Elevating it is the core value-add.
3. **Confidence markers per theme, not just overall**. "appears in 5/5" vs. "mentioned once" changes how a reader weights a claim. Aggregating to overall confidence flattens the signal.
4. **Omit per-meeting fields in frontmatter**. synthesis aggregates; per-meeting identity lives in `source_meetings`. Keeps frontmatter semantically clean.
5. **Format hints are output shaping, not separate modes**. one process produces the full synthesis data; the hint controls section ordering and truncation for specific use cases. Avoids code duplication across mode variants.

## Validation checkpoints

- Frontmatter conforms to synthesis-specific schema (omits single-meeting fields)
- `source_meetings` is non-empty list
- `time_range.start` ≤ `time_range.end`
- Every theme has a confidence marker
- Every contradiction has before/after source citations
- At least 1 prioritized follow-up
- Zero-friction execution section in SKILL.md
- Link to family contract in SKILL.md
