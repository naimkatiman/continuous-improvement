# [F-34] THREAD_PROFILES.md Machine-Readable Reference

Status: Backlog
Milestone: v2.12.0
Issue: TBD
Agent: Claude Opus 4.7

## Scope

Create `library/skill-output-samples/THREAD_PROFILES.md`. a machine-readable reference for the three canonical sample threads (Storevine, Brainshelf, Workbench) that codifies what today lives in prose across `README_SAMPLES.md` and in the heads of sample authors. The reference is consumed by `utility-pm-skill-builder` (F-32) to generate thread-appropriate scenarios and by any future tooling that needs per-thread context.

Prerequisite to F-32 (pm-skill-builder sample generation).

## Problem

The three thread profiles (Storevine B2B ecommerce, Brainshelf consumer PKM, Workbench enterprise collaboration) are well-documented in `README_SAMPLES.md` as prose. covering company context, team size, feature arc, prompt style, and real competitors referenced. But the profiles are scattered across multiple sections and written for human readers.

When an automated tool (pm-skill-builder, a future sample-regeneration tool, or a cross-thread synthesis analyzer) needs per-thread context, it either re-extracts from prose each time or hardcodes a brittle subset. There's no single machine-readable source of truth.

Consequences:
- Scenario generation is inconsistent across tools
- Updating a thread profile (e.g., changing Storevine's employee count) requires updating multiple prose locations
- New tools duplicate the prose-parsing work

Closing this gap means: every tool that needs thread context reads the same structured file; updates happen in one place; scenario generation has a rich, consistent source.

## How It Works

### File format

Markdown with structured YAML frontmatter per thread. Machine-readable subsections under each thread covering:

- **Identity**: company name, type, stage, team size, user base
- **Feature arc**: named product feature explored across samples (Campaigns / Resurface / Blueprints)
- **Prompt style**: how this thread's PM tends to write prompts (structured / casual / enterprise-complete)
- **Stakeholder cast**: named fictional characters commonly appearing in samples
- **Real competitors**: named publicly-referenced competitors for each thread
- **Scenario catalog**: representative scenario stubs per skill-category, expandable as new skills ship

### Example structure

```markdown
---
thread: storevine
company_type: b2b-ecommerce-platform
stage: series-a
team_size: 70
user_base: 15K merchants
feature_arc: campaigns
prompt_style: organized
real_competitors: [shopify, squarespace, wix, klaviyo, mailchimp]
---

## Storevine. B2B Ecommerce Platform

### Stakeholder cast (fictional, consistent across samples)
- jonathan-pm: primary PM
- maria-eng: engineering lead
- alex-marketing: marketing lead
- ...

### Scenario catalog
- meeting-skills: Campaigns launch kickoff, pricing decision, stakeholder updates
- discovery-skills: merchant interview synthesis, competitive analysis
- ...
```

### How tools consume it

Tools load the document and parse per-thread sections. Key fields map to scenario generation:

- `feature_arc` tells the scenario generator which product context to anchor in
- `stakeholder_cast` provides names for attendees, decision-makers, etc.
- `scenario_catalog` provides scaffold scenarios by skill category
- `prompt_style` tells the generator how to phrase the sample's Prompt section

### Relationship to README_SAMPLES.md

README_SAMPLES.md continues to serve as the human-readable navigation doc. THREAD_PROFILES.md is the machine-readable complement. cross-linked but distinct. Any discrepancy between them is a bug (likely trackable via a new CI check).

## Classification

- Type: new reference document (no skill; documentation-as-data)
- Directory: `library/skill-output-samples/`
- Consumers: `utility-pm-skill-builder` (primary), any future thread-aware tooling

## Exemplars

- `library/skill-output-samples/README_SAMPLES.md`. prose source that informs THREAD_PROFILES.md
- `library/skill-output-samples/SAMPLE_CREATION.md`. standards doc that THREAD_PROFILES.md complements
- `docs/reference/skill-families/meeting-skills-contract.md`. machine-readable reference pattern for a related concept (family contract)

## Deliverables

- `library/skill-output-samples/THREAD_PROFILES.md`. the reference document
- `library/skill-output-samples/README_SAMPLES.md`. updated to cross-link to THREAD_PROFILES.md
- Optional: `scripts/check-thread-profiles-consistency.sh`. verifies README_SAMPLES.md and THREAD_PROFILES.md stay consistent (deferred to v2.13.0+ if usage signals demand)

## Validation

- Manual review: does THREAD_PROFILES.md capture every distinct piece of thread context that a sample author references today?
- Consumer test: does F-32 (pm-skill-builder) successfully generate thread-appropriate scenarios using only THREAD_PROFILES.md + skill purpose?

## Open Questions

- Should THREAD_PROFILES.md include a "scenario generation seed" field. a pre-populated set of stock scenarios per skill-category per thread that tools can pick from without generating fresh each time? Proposal: start without; add if F-32 generation quality is unsatisfactory.
- When a new narrative thread is added (if ever. the 3 current threads cover the B2B / consumer / enterprise spectrum), what's the process? Proposal: document in THREAD_PROFILES.md's own preamble. "to add a thread, ensure it fills a distinct archetype gap and update consumers."
- Stakeholder-cast names: should they be standardized across threads (i.e., every thread has a PM named jonathan-pm) or intentionally distinct per thread? Proposal: distinct. preserves narrative richness and prevents confusion between threads in multi-thread samples.

## Dependencies

- None (prerequisite for F-32, but independently shippable)

## Status Transitions

- **Backlog** (current)
- **In Progress**. when extraction from README_SAMPLES.md begins
- **Shipped**. on v2.12.0 tag + push

## Detailed specification

Deferred. produced during document authoring. Starting point: extract all per-thread content from current README_SAMPLES.md, structure per the example format above.
