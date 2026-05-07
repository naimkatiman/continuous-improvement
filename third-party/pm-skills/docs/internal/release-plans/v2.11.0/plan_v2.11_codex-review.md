# v2.11.0 Codex Adversarial Review + Resolution Plan

**Date**: 2026-04-17
**Reviewer**: Codex (via `codex:codex-rescue` subagent, adversarial stance)
**Review scope**: Meeting Skills Family. canonical contract, 5 SKILL.md + TEMPLATE.md + EXAMPLE.md sets, validator script, 10 library samples, master plan, v2.11.0 release plan
**Review trigger**: All built-in validators (lint-skills-frontmatter, validate-commands, validate-agents-md, validate-meeting-skills-family, validate-skills-manifest) pass; user requested adversarial second look for edge cases and second-order failure modes
**Findings**: 3 CRITICAL, 7 IMPORTANT, 3 MINOR, 1 NIT. 14 total

---

## Phase-prefix standard verification (user-requested sanity check)

User flagged concern that one of the findings might relate to phase-prefix inconsistency between skill directories and commands.

**Verification result**: No inconsistency. Phase-prefix standard is correctly followed.

| Convention | Includes prefix? | Example |
|------------|------------------|---------|
| Skill directory name | Yes | `skills/foundation-meeting-agenda/` |
| Skill frontmatter `name` field | Yes | `name: foundation-meeting-agenda` |
| Slash command file name | No | `commands/meeting-agenda.md` |
| Slash command invocation | No | `/meeting-agenda` |

This pattern matches every existing pm-skill (verified via `ls skills/` and `ls commands/`): `foundation-lean-canvas` → `/lean-canvas`, `foundation-persona` → `/persona`, `utility-mermaid-diagrams` → `/mermaid-diagrams`, `deliver-prd` → `/prd`, etc.

My meeting-skills-family implementation:
- `foundation-meeting-agenda/` → `/meeting-agenda` ✓
- `foundation-meeting-brief/` → `/meeting-brief` ✓
- `foundation-meeting-recap/` → `/meeting-recap` ✓
- `foundation-meeting-synthesize/` → `/meeting-synthesize` ✓
- `foundation-stakeholder-update/` → `/stakeholder-update` ✓

The CRITICAL #1 finding (below) is about the *`artifact_type` frontmatter field enum*, which is a separate concept from skill-directory/command naming. The finding stands, but it is not a phase-prefix issue.

---

## Summary by severity

| Severity | Count | Must fix before release? |
|----------|-------|--------------------------|
| CRITICAL | 3 | **Yes**. real bugs that break chaining or produce silent CI passes |
| IMPORTANT | 7 | Recommended. UX failure modes and process robustness |
| MINOR | 3 | Nice to have. DST/Unicode edge cases, enum expansion |
| NIT | 1 | Count drift in release plan |

Execution plan: full pass. all 14 findings addressed, contract bumped to v1.1.0, all validators re-run green.

---

## CRITICAL Findings

### CRITICAL #1. `artifact_type` enum mismatch (contract self-contradiction)

**Problem**: `docs/reference/skill-families/meeting-skills-contract.md` enumerates `artifact_type` values as bare names:

```
agenda
brief
recap
synthesis
stakeholder-update
```

But every implementation uses prefixed names (`meeting-agenda`, `meeting-brief`, `meeting-recap`, `meeting-synthesis`, `stakeholder-update`). The contract's own example YAML in the "Universal base fields" section uses `artifact_type: meeting-recap`. which is **not in its own stated enum**. The validator at `scripts/validate-meeting-skills-family.sh` expects the prefixed form via `ALLOWED_ARTIFACT_TYPE` mapping. Templates and samples use the prefixed form.

**Impact**: Downstream consumers following the contract's letter (bare names) would reject artifacts that CI blesses. Self-inconsistent spec.

**Resolution**: Adopt the prefixed form everywhere (Option B in my analysis). Update contract enum listing to:

```
meeting-agenda
meeting-brief
meeting-recap
meeting-synthesis
stakeholder-update
```

Rationale:
- `stakeholder-update` is already compound and works naturally
- Prefixed form prevents collisions if a future skill family has overlapping bare names
- Implementation already uses this form; changing templates + validator + samples would touch more files than changing the contract enum listing

**Files touched**:
- `docs/reference/skill-families/meeting-skills-contract.md`. enum listing
- No other files need change (implementation is already prefixed)

**Verification**: validator's `ALLOWED_ARTIFACT_TYPE` map already enforces prefixed values; re-running validator confirms conformance.

---

### CRITICAL #2. Validator doesn't check filename convention; samples teach broken filenames

**Problem**: Contract claims validator checks "File naming in examples" (in the Enforcement section), but `scripts/validate-meeting-skills-family.sh` never reads EXAMPLE.md or `library/skill-output-samples/`. Consequence: samples include filename references that violate the convention (missing `HH-MMtimezone`), and CI stays green.

Specific nonconforming filenames in samples:
- `2026-03-18_pricing-discovery-research_recap.md` (in agenda decision-meeting sample, Sources section)
- `2026-01-22_exec-review_recap.md` (in synthesize exec-board-prep sample)
- Others likely exist across samples

**Impact**: Users reading samples learn the wrong filename pattern. Filename-based chaining (the family's identity model) silently fails when artifacts are named this way, because auto-discovery regex won't match.

**Resolution (two parts)**:

Part A. Extend validator to scan filename references in SKILL.md examples, EXAMPLE.md, and sample outputs. Validate against regex:

```regex
# Single-meeting artifacts (agenda, brief, recap, stakeholder-update):
^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}[A-Z]{3,5}_[a-z0-9-]+_(agenda|brief|recap|stakeholder-update(-[a-z]+-[a-z]+)?)(_prepared-\d{4}-\d{2}-\d{2})?\.md$

# Synthesis artifacts:
^(\d{4}-Q\d|\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2})_[a-z0-9-]+_synthesis(_prepared-\d{4}-\d{2}-\d{2})?\.md$
```

Scan strategy: read EXAMPLE.md + sample markdown files, extract strings matching `\d{4}-\d{2}-\d{2}_.+\.md`, validate each against the expected regex.

Part B. Fix nonconforming filename references in existing samples:

| Sample | Nonconforming reference | Corrected reference |
|--------|------------------------|---------------------|
| `foundation-meeting-agenda/sample_foundation-meeting-agenda_decision-meeting.md` | `2026-03-18_pricing-discovery-research_recap.md` | `2026-03-18_14-00EST_pricing-discovery-research_recap.md` |
| `foundation-meeting-synthesize/sample_foundation-meeting-synthesize_exec-board-prep.md` | `2026-01-22_exec-review_recap.md` | `2026-01-22_14-00EST_exec-review_recap.md` |
| `foundation-meeting-synthesize/sample_foundation-meeting-synthesize_exec-board-prep.md` | `2026-02-05_compliance-feasibility_recap.md` | `2026-02-05_14-00EST_compliance-feasibility_recap.md` |
| `foundation-meeting-synthesize/sample_foundation-meeting-synthesize_exec-board-prep.md` | `2026-02-26_pilot-customer-interview-debrief_recap.md` | `2026-02-26_14-00EST_pilot-customer-interview-debrief_recap.md` |
| `foundation-meeting-synthesize/sample_foundation-meeting-synthesize_exec-board-prep.md` | `2026-03-12_exec-review_recap.md` | `2026-03-12_14-00EST_exec-review_recap.md` |
| `foundation-meeting-synthesize/sample_foundation-meeting-synthesize_exec-board-prep.md` | `2026-03-26_sales-motion-alignment_recap.md` | `2026-03-26_14-00EST_sales-motion-alignment_recap.md` |
| `foundation-meeting-recap/sample_foundation-meeting-recap_decision-meeting.md` | `2026-03-26_v2-sprint-check-in_recap.md` | `2026-03-26_13-00PST_v2-sprint-check-in_recap.md` |
| `foundation-meeting-synthesize/sample_foundation-meeting-synthesize_project-retro.md` | Check for any missing-time references |

Any additional violations caught by the enhanced validator get fixed in the same pass.

**Files touched**:
- `scripts/validate-meeting-skills-family.sh` + `.ps1`. add filename scanning
- `scripts/validate-meeting-skills-family.md`. document the new checks
- Multiple samples (6+ files). fix filename references

---

### CRITICAL #3. Stakeholder-update filename can't distinguish channel/audience variants

**Problem**: Contract filename pattern is:

```
YYYY-MM-DD_HH-MMtimezone_title_artifact-type.md
```

For `stakeholder-update` this produces a single filename per meeting. But the skill supports 5 channels × 5 audiences = 25 possible variant combinations. If a user generates `leadership` email and `engineering` slack updates from the same meeting, they collide on filename.

**Impact**: Collision risk. Advertised channel/audience variants cannot coexist in the same directory. Thread-continuation detection (which depends on filename match) breaks when a prior update was a different variant.

**Resolution**: Extend filename pattern for stakeholder-update to include channel and audience suffix:

**New pattern**: `YYYY-MM-DD_HH-MMtimezone_title_stakeholder-update-{channel}-{audience}[_prepared-YYYY-MM-DD].md`

Examples:
- `2026-04-17_14-00EST_search-feature-kickoff_stakeholder-update-slack-engineering.md`
- `2026-04-17_14-00EST_search-feature-kickoff_stakeholder-update-email-leadership.md`
- `2026-04-17_14-00EST_search-feature-kickoff_stakeholder-update-notion-mixed.md`

Rationale:
- Preserves prefix-based grouping (meeting date + time + title still sorts adjacent)
- Channel + audience are already frontmatter fields; using them in the filename is zero additional user input
- Thread-continuation detection still works (match on same-project, regardless of variant suffix)
- Other artifact types (agenda, brief, recap) keep their current naming (single artifact per meeting)

Alternative considered: using a sequence number (`_stakeholder-update-1.md`, `_stakeholder-update-2.md`). Rejected because numbering has no semantic meaning and makes cross-reference brittle.

**Files touched**:
- `docs/reference/skill-families/meeting-skills-contract.md`. file naming section + per-skill additional fields note
- `skills/foundation-stakeholder-update/references/TEMPLATE.md`. frontmatter example showing filename
- `skills/foundation-stakeholder-update/SKILL.md`. filename convention documentation
- Library samples. update any internal filename references
- Validator regex. update to accept the variant suffix

---

## IMPORTANT Findings

### IMPORTANT #1. Go-mode `go` passes load-bearing low-confidence inferences without acknowledgment

**Problem**: Contract says blocking questions happen only when inference confidence is "actively low". Samples show medium-to-low confidence inferences on stakeholder positions, primary CTAs, and decision owners. A user typing `go` can accept strategic advice built on weak inferences without noticing.

**Resolution**: Add **load-bearing gates** to the contract's go-mode section. Below-high confidence on any of these fields requires explicit acknowledgment or suppression of dependent recommendations:

- Stakeholder positions (if any are inferred below-high, flag in inference summary as "⚠ stakeholder-position inference is low-confidence; recommend confirming before using tactical-notes guidance")
- Primary ask / primary CTA (below-high confidence → explicit "⚠ primary ask inferred; confirm before acting")
- Decision-maker attribution (below-high confidence → explicit "⚠ decision-maker inferred; verify before escalating")
- Anticipated questions (below-high → soft flag, not blocking)

Implementation: update contract "Zero-friction execution" section to include this refined rule; update each SKILL.md's process section to reference it.

**Files touched**:
- `docs/reference/skill-families/meeting-skills-contract.md`
- `skills/foundation-meeting-{agenda,brief,recap,synthesize,stakeholder-update}/SKILL.md`

---

### IMPORTANT #2. 30-min default conflicts with meeting-type variant defaults

**Problem**: Contract says default duration is 30 min. Agenda SKILL.md's meeting-type variants set different defaults per type (45 for decision-making, 60 for planning/review/project-kickoff, 60-90 for working-session). With absent duration plus inferred type, `--go` applies the conflicting 30-min default instead of the type-appropriate one.

**Resolution**: Make duration default **type-specific**. Only use 30 min for `other`, `1-on-1`, `exec-briefing`. Use type-variant defaults otherwise (already documented in agenda SKILL.md). Update contract to reference this and checkpoint when inferred type would imply more than 30 min.

**Files touched**:
- `docs/reference/skill-families/meeting-skills-contract.md`. duration section in universal requirements
- `skills/foundation-meeting-agenda/SKILL.md`. clarify that variant-specific defaults override the universal 30-min default

---

### IMPORTANT #3. Anti-meeting check is easily bypassed

**Problem**: Current triggers are "single-owner decision with no tradeoffs", "pure information broadcast", "status-only sync with >5 people". Trivially bypassed: keep the meeting at 5 attendees, or add the word "decision" to the topic.

**Resolution**: Invert the check. Require a positive **synchronous-value statement**:

The meeting must have at least one of:
- A tradeoff to discuss (multiple options, uncertain preference)
- A conflict to resolve (visible disagreement between named stakeholders)
- Co-creation (shared document-writing, whiteboarding)
- Relationship-building (first-time stakeholder meetings, mutual calibration)
- Blocker escalation (unblocking something time-sensitive)

If none of these, recommend async alternative. Default status-only / round-robin / broadcast-only meetings to async unless synchronous value is explicitly named.

**Files touched**:
- `docs/reference/skill-families/meeting-skills-contract.md`. anti-meeting check section
- `skills/foundation-meeting-agenda/SKILL.md`. anti-meeting check step
- `skills/foundation-meeting-brief/SKILL.md`. anti-meeting check step

---

### IMPORTANT #4. Synthesize can't reproduce results with mixed metadata source

**Problem**: Synthesize skill filters recaps by `meeting_type`, but recaps have explicit, inferred, or null meeting_type values. Filtering treats them uniformly, creating non-reproducible results (a rerun might classify a medium-confidence inferred meeting_type differently).

**Resolution**: Add `meeting_type_source` field to recap frontmatter (`explicit | inferred | null`) and `metadata_confidence` where inferred. Synthesize reports counts of each source type when filtering and documents null-policy explicitly.

**Files touched**:
- `docs/reference/skill-families/meeting-skills-contract.md`. frontmatter schema
- `skills/foundation-meeting-recap/references/TEMPLATE.md`. add source field
- `skills/foundation-meeting-recap/SKILL.md`. instruction to populate source
- `skills/foundation-meeting-synthesize/SKILL.md`. document filter behavior on mixed sources

---

### IMPORTANT #5. Recap `[owner: unassigned]` can create operationally broken recaps

**Problem**: Recap fabrication prohibition says missing owners become `[owner: unassigned, needs confirmation]`. A real transcript with 60% ownerless actions produces a recap that is "non-fabricated" but operationally broken. a pile of tickets without accountability. No threshold escalation mechanism.

**Resolution**: Add **ownership reconciliation threshold** to recap:

- If unassigned actions > 30% of total actions, OR any high-impact action lacks an owner: surface as "⚠ Ownership reconciliation required" section near the top of the recap (above topic-segments)
- Shareable summary leads with this flag if triggered
- Specific question list to resolve ambiguous ownership

**Files touched**:
- `skills/foundation-meeting-recap/SKILL.md`. instructions
- `skills/foundation-meeting-recap/references/TEMPLATE.md`. optional "Ownership reconciliation" section

---

### IMPORTANT #6. Synthesize tags resolved decision-evolution as contradictions

**Problem**: Synthesize's contradiction flags are styled as the "highest-value output" with `[!]` visual emphasis. The exec-board-prep sample includes a "Contradiction" that's actually a resolved scope evolution (Jan 22 broad → Mar 12 narrowed). Treating resolved evolution as contradiction creates false positives in exec contexts where the evolution was intentional.

**Resolution**: Split the "Contradictions" section into two distinct concepts:

- **Decision evolution** (resolved): earlier vs. later decisions on the same topic, where the later one supersedes. Historical context, not a red flag.
- **Unresolved contradictions**: decisions or positions currently in conflict, needing reconciliation. The `[!]` emphasis is reserved for this.

**Files touched**:
- `skills/foundation-meeting-synthesize/SKILL.md`. process step + instruction
- `skills/foundation-meeting-synthesize/references/TEMPLATE.md`. two separate sections
- `library/skill-output-samples/foundation-meeting-synthesize/*`. reclassify existing "contradictions" that are actually resolved evolution

---

### IMPORTANT #7. Stakeholder-update "entire output is shareable" claim is wrong in practice

**Problem**: Contract says stakeholder-update's "entire output is effectively shareable content" and exempts it from the `## Shareable summary` requirement. But the template includes `## Technical-to-business translation notes` and `## Sources & References`. internal audit sections that should NOT be shared with stakeholders. User who copies the "whole output" leaks audit notes.

**Resolution**: Add an explicit **`## Shareable update` copy block** at the top of stakeholder-update output that contains only the channel-tailored content. Audit notes and Sources remain below, outside the shareable boundary. Validator exempts the skill from `## Shareable summary` (because the specific heading differs) but now enforces the new `## Shareable update` heading.

**Files touched**:
- `docs/reference/skill-families/meeting-skills-contract.md`. stakeholder-update exemption wording
- `skills/foundation-stakeholder-update/references/TEMPLATE.md`. add explicit `## Shareable update` section
- `skills/foundation-stakeholder-update/SKILL.md`. clarify boundary
- `skills/foundation-stakeholder-update/references/EXAMPLE.md`. update
- Library samples (2). add shareable boundary
- Validator. change stakeholder-update exemption to enforce `## Shareable update` instead of exempting from summary entirely

---

### IMPORTANT #8. Validator is schema-shape-only; misses per-skill field requirements

**Problem**: Validator checks universal frontmatter fields but not per-skill specifics. An agenda without `desired_outcomes`, a recap without `agenda_reconciliation`, a stakeholder-update with invalid `channel` enum, or a brief with non-private `visibility` all pass CI.

**Resolution**: Enhance validator to parse YAML structurally and enforce per-skill required fields and enum values:

- agenda: `meeting_duration_minutes` (positive int), `desired_outcomes` (non-empty list)
- brief: `primary_ask` (non-empty string), `visibility: private` default
- recap: `agenda_reconciliation` object with required keys, `meeting_quality` object
- synthesize: `source_meetings` (non-empty list), `time_range` object, omits single-meeting fields
- stakeholder-update: `channel` in enum, `audience_variant` in enum, `primary_cta` non-empty

**Files touched**:
- `scripts/validate-meeting-skills-family.sh` + `.ps1`. add per-skill validation (parse YAML via yq if available, else grep-based fallback)
- `scripts/validate-meeting-skills-family.md`. document the new checks

---

## MINOR Findings

### MINOR #1. Timezone abbreviations are DST-ambiguous

**Problem**: Abbreviations like `EST`, `PST` shift with DST. Samples use `EST` in April (which is actually EDT). Ambiguity across regions and DST transitions.

**Resolution**: Contract continues to accept abbreviations for user-friendliness (users know `EST` better than `-0400`), but documents that:
- Frontmatter `meeting_start_time` may use abbreviations
- For precise cross-system identity, complement with IANA timezone in frontmatter where needed
- Filename time is the user-facing identifier; DST drift within a single user's timezone is low-risk; cross-region collaboration should use UTC

Lightweight addition: filename convention note mentions this tradeoff without enforcing a change.

**Files touched**:
- `docs/reference/skill-families/meeting-skills-contract.md`. file naming section note

---

### MINOR #2. No slug normalization rules for `title` in filenames

**Problem**: Filenames use `title` slug but contract defines no normalization (Unicode, punctuation, duplicate titles). Breaks cross-OS link matching.

**Resolution**: Add slug rules to contract:

- ASCII lowercase only; transliterate Unicode (via Python `unicodedata.normalize` or manual map for common cases)
- Hyphen separators; strip all other punctuation
- Max length: 60 chars
- Collision handling: for same-day-same-time-same-title, append `-2`, `-3` (document the collision suffix)

**Files touched**:
- `docs/reference/skill-families/meeting-skills-contract.md`. file naming section

---

### MINOR #3. Meeting-type enum missing common archetypes

**Problem**: Enum omits incident/postmortem, customer-call, office-hours, training-workshop, roadmap-review, triage, business-review. `other` becomes a dumping ground.

**Resolution**: Expand enum with the most common missing archetypes:

```
standup
planning
review
decision-making
brainstorm
1-on-1
stakeholder-review
project-kickoff
working-session
exec-briefing
incident-postmortem      ← new
customer-call            ← new
training-workshop        ← new
business-review          ← new
other
```

Skip `office-hours`, `roadmap-review`, `triage`. these can map to existing types (`working-session`, `review`, `standup` respectively) without loss.

**Files touched**:
- `docs/reference/skill-families/meeting-skills-contract.md`. meeting-type enum
- Optionally: `skills/foundation-meeting-agenda/SKILL.md`. variant behaviors for new types (can defer; agenda handles `other` gracefully)

---

## NIT Finding

### NIT #1. v2.11.0 release plan count drift

**Problem**: `docs/internal/release-plans/v2.11.0/plan_v2.11.0.md` says "Skill count grows from 32 to 37 (+5)" and lists per-skill deliverables as "Not started" even though skills are authored and count is 38 (F-26 was already shipped-to-main pre-release).

**Resolution**: Update release plan's Decisions table count 37→38, update Deliverables table status from "Not started" to current status (authored, samples partial, CI green).

**Files touched**:
- `docs/internal/release-plans/v2.11.0/plan_v2.11.0.md`

---

## Execution order

Phases to execute in this session:

1. Write this doc ← **completed now**
2. CRITICAL #1 (enum). contract-only edit, 1 file
3. CRITICAL #2 (filename validation). validator enhancement + 6-8 sample filename fixes
4. CRITICAL #3 (stakeholder-update filenames). contract + 2-3 sample updates + validator
5. IMPORTANT #1-8. multiple file edits
6. MINOR #1-3. contract-only edits
7. NIT #1. release plan update
8. Bump contract to v1.1.0
9. Re-run all validators
10. Update master plan with resolution log
11. Update this doc's "resolution status" column below

---

## Resolution status tracker

Updated as each fix lands.

### Round 1 (first adversarial review, 2026-04-17)

| # | Severity | Title | Status | Date |
|---|----------|-------|--------|------|
| 1 | CRITICAL | artifact_type enum mismatch | **resolved** | 2026-04-17. contract enum updated to prefixed form (`meeting-agenda` etc.) |
| 2 | CRITICAL | Validator filename-check gap | **resolved** | 2026-04-17. validator scans EXAMPLE.md + samples; 13 nonconforming filename references fixed |
| 3 | CRITICAL | Stakeholder-update filename collision | **resolved** | 2026-04-17. contract adds `-{channel}-{audience}` variant suffix pattern; samples updated |
| 4 | IMPORTANT | Load-bearing inference gates | **resolved** | 2026-04-17. contract Zero-friction section adds `⚠` flag rule for below-high inferences on stakeholder positions, CTA, decision-makers; agenda and brief SKILL.md reference it |
| 5 | IMPORTANT | 30-min default conflict | **resolved** | 2026-04-17. contract adds type-specific duration table; agenda SKILL.md updated |
| 6 | IMPORTANT | Anti-meeting check bypassable | **resolved** | 2026-04-17. contract requires positive synchronous-value statement (tradeoff/conflict/co-creation/relationship-building/blocker-escalation); agenda + brief SKILL.md updated |
| 7 | IMPORTANT | Synthesize metadata source tracking | **resolved** | 2026-04-17. recap frontmatter adds `meeting_type_source` (explicit/inferred/null); synthesize SKILL.md documents mixed-source handling |
| 8 | IMPORTANT | Recap unassigned-action threshold | **resolved** | 2026-04-17. recap SKILL.md adds ownership-reconciliation threshold (30% or high-priority unassigned triggers `⚠` section); `unassigned_action_ratio` frontmatter field added |
| 9 | IMPORTANT | Contradiction vs. evolution split | **resolved** | 2026-04-17. synthesize SKILL.md + TEMPLATE.md split into "Decision evolution" (resolved, no `⚠`) and "Unresolved contradictions" (reserve `⚠`); both synthesize samples updated |
| 10 | IMPORTANT | Stakeholder-update shareable boundary | **resolved** | 2026-04-17. contract requires `## Shareable update` section for stakeholder-update (replaces "entire output is shareable" claim); explicit boundary marker added; validator enforces it; template, example, and 2 samples updated |
| 11 | IMPORTANT | Validator per-skill field enforcement | **deferred** | Not addressed in this pass. requires YAML parsing; scope beyond what fits in this session. Tracked as follow-up. Current validator catches contract conformance and filename violations; deeper per-skill field validation is a future enhancement. |
| 12 | MINOR | Timezone DST note | **resolved** | 2026-04-17. contract file-naming section adds DST note and IANA-timezone complement option |
| 13 | MINOR | Slug normalization rules | **resolved** | 2026-04-17. contract file-naming section adds ASCII lowercase rule, 60-char max, collision suffix convention |
| 14 | MINOR | Meeting-type enum expansion | **resolved** | 2026-04-17. added `incident-postmortem`, `customer-call`, `training-workshop`, `business-review` to contract enum; agenda SKILL.md variant defaults updated via contract reference |
| 15 | NIT | Release plan count correction | **resolved** | 2026-04-17. `plan_v2.11.0.md` count updated from 37 to 38; Foundation breakdown corrected (persona + lean-canvas + 5 meeting = 7 foundation) |

---

### Round 2 (second adversarial review, 2026-04-18)

Second Codex review after v1.1.0 contract + 15-sample restructure. Found 11 additional findings (0 CRITICAL, 6 IMPORTANT, 3 MINOR, 2 NIT). Resolution pass executed same session.

| # | Severity | Title | Status | Date |
|---|----------|-------|--------|------|
| R2-1 | IMPORTANT | Contract duration example contradicts type-specific table (30 min for decision-making) | **resolved** | 2026-04-18. updated go-mode example to 45 min |
| R2-2 | IMPORTANT | Contract uses `--type=decision` but enum is `decision-making`; `artifact_type` inline comment shows OLD bare enum names | **resolved** | 2026-04-18. both fixed |
| R2-3 | IMPORTANT | Validator-what-it-checks section still says "stakeholder-update whole output is shareable" (contradicts v1.1.0 boundary) | **resolved** | 2026-04-18. rewritten to require `## Shareable update` section |
| R2-4 | IMPORTANT | README_SAMPLES.md count 109 vs filesystem 120 (11-sample undercount missing legacy/orbit samples) | **resolved** | 2026-04-18. count corrected + breakdown restructured to account for legacy/orbit |
| R2-5 | IMPORTANT | Pre-release checklist's sample-count check is passive; doesn't require concrete command execution | **resolved** | 2026-04-18. added explicit bash command + paste-output requirement |
| R2-6 | IMPORTANT | 3 recap samples have `generated_at` timestamp BEFORE meeting start (impossible artifact) | **resolved** | 2026-04-18. storevine pricing + brainshelf scope-cut + workbench customer-feedback all bumped to post-meeting timestamps |
| R2-7 | MINOR | Samples lack top-level sample-library frontmatter per SAMPLE_CREATION.md Section 5 | **resolved** | 2026-04-18. all 15 samples now have 8-field frontmatter (artifact, version, repo_version, skill_version, created, status, thread, context) |
| R2-8 | MINOR | Recap shareable summary exceeds 3-6 line bound with mini-headings | **deferred** | Stylistic refinement; not correctness. Track as v2.11.1 patch candidate. |
| R2-9 | MINOR | Fictional-marker discipline inconsistent ($49/mo, $9/mo, $16/mo, $8/mo unmarked) | **resolved** | 2026-04-18. storevine pricing ($49, $9) + brainshelf curator ($16, $8) markers added; remaining samples clean per grep audit |
| R2-10 | NIT | Guide mermaid go-mode diagram routes `--go` through user-response node (wrong) | **resolved** | 2026-04-18. diagram updated to show `--go` as invocation-level branch bypassing inference-summary checkpoint |
| R2-11 | NIT | End-marker convention in guide + samples but not documented in contract | **resolved** | 2026-04-18. contract Shareable update section adds end-marker convention |

**Round 2 summary**: 10 of 11 resolved. 1 deferred (MINOR #2 stylistic). No CRITICAL findings. Contract version unchanged (remains v1.1.0; these are errata within v1.1.0, not a version bump).

---

## Contract version bump

Upon completion of this resolution pass, bump contract from v1.0.0 to **v1.1.0** (MINOR per the contract's own SemVer rules. additive fields, additive enum members, new optional frontmatter field, clarification of stakeholder-update boundary). No breaking changes because:
- Enum expansion is additive (existing values still valid)
- New frontmatter fields are optional
- Filename pattern for stakeholder-update is additive (the un-suffixed form is still valid for legacy artifacts but should be upgraded)

Changelog entry in the contract's own Change log section documents the bump.
