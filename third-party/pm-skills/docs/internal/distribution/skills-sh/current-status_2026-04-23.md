---
title: skills.sh Current Status Snapshot
status: Point-in-time snapshot
snapshot_date: 2026-04-23
captured_by: jprisant (via Claude session)
related:
  - ../skills-sh.md (canonical reference)
  - ../2026-04-22_skills-sh.md (submission effort plan)
  - ../../../releases/Release_v2.11.1.md
---

# skills.sh Current Status Snapshot (2026-04-23)

Point-in-time record of pm-skills' actual state on skills.sh as observed the day after v2.11.1 shipped. Overturns the "zero installs, waiting for soft-launch" narrative that drove the distribution plan. pm-skills is already on skills.sh with 1.2K installs and meaningful organic traction that predates the submission effort.

---

## TL;DR

- **pm-skills is already listed at https://skills.sh/product-on-purpose/pm-skills**
- **1.2K total installs** across 35 skills shown
- **35 skills is wrong**. the v2.11.0 broken state (32 real + 3 stale phantoms) minus the 6 foundation skills that were YAML-dropped. Should be 38 after v2.11.1 is re-indexed.
- **Top 3 "skills" are actually the stale `.claude/skills/` phantoms** (`init-project`, `wrap-session`, `init-project-jpkb`) we removed from tracking in v2.11.1. They account for 181 of the 1.2K installs (~15%).
- **Real pm-skills content gets 30 to 34 installs per skill** (domain/phase skills) or 14 to 21 (utility skills).
- **6 foundation skills have 0 installs** because they were silently dropped by the CLI before v2.11.1 fixed them.

This means the go-forward action is not "launch to drive first installs" but rather "amplify existing traction, correct the skill count on the indexer, and re-route attention from phantom skills to real ones."

---

## Metadata snapshot

| Field | Value as of 2026-04-23 |
|-------|--------|
| Detail page URL | https://skills.sh/product-on-purpose/pm-skills |
| HTTP status | 200 (page resolves and renders real data) |
| Total install count shown | 1.2K |
| Skills shown | 35 |
| Skills expected after v2.11.1 | 38 |
| Delta | 35 to 38 (3 missing; indexer lag) |
| Install command shown | `npx skills add product-on-purpose/pm-skills` (matches our canonical) |
| Owner/repo link | Correct (product-on-purpose/pm-skills on GitHub) |
| GitHub stars field | Not displayed |
| First-seen date field | Not displayed |
| Description field | Not displayed |
| Leaderboard rank field | Not displayed |
| Security audit badges | Not observed in this snapshot |

---

## Full per-skill install counts (35 skills, 1.2K total)

Ranked by install count, descending.

| Rank | Skill | Installs | Category |
|------|-------|----------|----------|
| 1 | init-project | 61 | **Phantom (removed v2.11.1)** |
| 2 | wrap-session | 60 | **Phantom (removed v2.11.1)** |
| 3 | init-project-jpkb | 60 | **Phantom (removed v2.11.1)** |
| 4 | define-problem-statement | 34 | Phase: define |
| 5 | deliver-prd | 34 | Phase: deliver |
| 6 | define-opportunity-tree | 34 | Phase: define |
| 7 | develop-solution-brief | 34 | Phase: develop |
| 8 | define-hypothesis | 34 | Phase: define |
| 9 | iterate-pivot-decision | 34 | Phase: iterate |
| 10 | discover-interview-synthesis | 33 | Phase: discover |
| 11 | discover-stakeholder-summary | 33 | Phase: discover |
| 12 | discover-competitive-analysis | 33 | Phase: discover |
| 13 | measure-experiment-design | 33 | Phase: measure |
| 14 | measure-experiment-results | 33 | Phase: measure |
| 15 | deliver-user-stories | 33 | Phase: deliver |
| 16 | deliver-acceptance-criteria | 33 | Phase: deliver |
| 17 | develop-adr | 33 | Phase: develop |
| 18 | foundation-persona | 33 | Foundation |
| 19 | deliver-edge-cases | 32 | Phase: deliver |
| 20 | develop-design-rationale | 32 | Phase: develop |
| 21 | utility-pm-skill-builder | 32 | Utility |
| 22 | iterate-retrospective | 32 | Phase: iterate |
| 23 | measure-dashboard-requirements | 32 | Phase: measure |
| 24 | define-jtbd-canvas | 31 | Phase: define |
| 25 | iterate-lessons-log | 31 | Phase: iterate |
| 26 | deliver-launch-checklist | 31 | Phase: deliver |
| 27 | iterate-refinement-notes | 31 | Phase: iterate |
| 28 | develop-spike-summary | 31 | Phase: develop |
| 29 | measure-instrumentation-spec | 31 | Phase: measure |
| 30 | deliver-release-notes | 30 | Phase: deliver |
| 31 | utility-slideshow-creator | 21 | Utility |
| 32 | utility-mermaid-diagrams | 21 | Utility |
| 33 | utility-pm-skill-validate | 19 | Utility |
| 34 | utility-pm-skill-iterate | 19 | Utility |
| 35 | utility-update-pm-skills | 14 | Utility |

## Skills absent from skills.sh but present in v2.11.1

Six foundation skills shipped in v2.11.0 with a YAML-frontmatter bug that silently dropped them from CLI discovery. Fixed in v2.11.1 but not yet reflected on skills.sh. Current install count on all six: **0**.

- foundation-lean-canvas
- foundation-meeting-agenda
- foundation-meeting-brief
- foundation-meeting-recap
- foundation-meeting-synthesize
- foundation-stakeholder-update

Once the indexer re-polls the repo after v2.11.1, these should appear on the detail page and begin accruing installs.

---

## Interpretation

### Why the top 3 are phantom skills

`init-project`, `wrap-session`, and `init-project-jpkb` are general-purpose agentic skills that leaked into pm-skills from the maintainer's personal `.claude/skills/` setup. They predate the `.claude/skills/*` gitignore rule, which is why they remained tracked. They were removed in v2.11.1.

Hypotheses for why they dominate the install count:

1. **Name-space bias**: `init-project` is a generic skill name that PMs searching skills.sh for project-setup tooling may have discovered and installed directly, regardless of the pm-skills context.
2. **Bundle-install completeness**: users running `npx skills add product-on-purpose/pm-skills` without a skill filter got all 35 discoverable skills. The phantoms were included, inflating their count alongside the real skills.
3. **Sequence effects**: if the phantoms were added to the repo earlier than most domain/utility skills, they had more time to accumulate installs.

Without access to telemetry timestamps, we can't distinguish among these. Most likely a combination.

### Why domain skills cluster at 30 to 34

A cluster this tight (30 to 34 for 26 skills) suggests most users run the unfiltered bundle install. Each full-bundle install increments every discoverable skill's count by 1. The variance within the cluster (30 to 34) likely reflects the order in which skills were added to the repo. older skills had more weeks to accumulate their bundle-install contributions.

### Why utilities are lower

21 for mermaid-diagrams and slideshow-creator; 14 to 19 for the pm-skill lifecycle tools (builder/validate/iterate) and update-pm-skills. Hypotheses:

1. **Authored later**: utility skills were added in v2.8.0 and later; they had less time to accumulate bundle installs.
2. **Selective install filter**: some users may filter to phase skills only (`--skill 'define-*' --skill 'deliver-*'` etc.) and skip utilities.
3. **Less PM relevance**: utilities like `pm-skill-builder` are meta-tools for skill authors; most PMs don't need them for their day-to-day work.

### Why the 6 foundation skills have 0 installs

The v2.11.0 skills CLI YAML parser silently dropped them. Every `npx skills add` in the v2.11.0-to-v2.11.1 window installed 35 skills, not 38. These 6 literally never had a chance to accrue installs.

---

## What this means for the distribution plan

### What's invalidated

The `docs/internal/distribution/2026-04-22_skills-sh.md` plan assumed install count was near zero and Phase 5 soft-launch was required to get on the leaderboard. That assumption is wrong.

### What's still valid

- **v2.11.1 technical fixes remain necessary**: the 6 foundation skills still need to re-index. The install command still needs to work. The lint rules still prevent regression.
- **Phase 5 soft-launch is still useful**: amplifying existing 1.2K to a larger number is strategy, not bootstrap. The content of a Phase 5 post changes (can now say "1.2K installs" as social proof) but the fundamental action is the same.
- **Phase 6 monitor + retro is still useful**: tracking whether v2.11.1 fixes successfully re-index the skill count and whether foundation skills start accruing installs is a valuable feedback loop.

### What's newly visible

- **Indexer lag window**: some unknown number of hours to days between a repo push and the skills.sh detail page refreshing. We now have a natural experiment: yesterday's push + today's install from `pm-skills_tmp` should trigger a re-poll. We can measure the lag by checking the page daily.
- **Install-count attribution to phantoms**: 15% of our install count is phantom-skill attribution. After v2.11.1, new bundle installs will not include phantoms, so those numbers freeze. The real-pm-skills count will grow, the phantom count will plateau.
- **Foundation-skill zero-install problem**: v2.11.1's most important fix has the longest recovery time. Those 6 skills start from 0 and need weeks of organic discovery or active promotion to reach parity with the 30-to-34 cluster.

---

## Actions taken today (2026-04-23)

1. **Live install from clean directory** (`E:\Projects\product-on-purpose\pm-skills_tmp`): ran `npx skills add product-on-purpose/pm-skills` with no telemetry-disabling env vars. All 38 skills installed successfully (the fix worked end-to-end). Telemetry ping should have fired for the post-v2.11.1 state.
2. **Verified detail page state**: pulled the live skills.sh page and captured the 35-skill / 1.2K-install snapshot above.
3. **Documented the findings**: this doc.

---

## Open questions

1. **How long until skills.sh indexer refreshes to show 38 skills?** Expected: hours to days. Unknown exact. Revisit in 24, 48, 72 hours.
2. **Will the 3 phantom skills' install counts freeze now that they're removed, or continue to update from cached pre-v2.11.1 clones still on disk somewhere?** Unknown.
3. **What is pm-skills' current leaderboard rank?** Not shown on the detail page. Would need to browse the leaderboard directly to determine.
4. **Why don't GitHub stars, first-seen date, or description show on the detail page?** Possibly: missing metadata fields that skills.sh renders only when populated by the CLI's scan. Worth investigating what signals we can surface.
5. **Can we correlate installs to specific referral sources** (did users find us via search, leaderboard, word of mouth)? Telemetry is anonymous so likely no, but worth asking Vercel Labs if they offer any maintainer-side analytics.

---

## Recommended next checks

### Immediate (today)

- None. The install-count change takes indexer time to propagate.

### 24 to 72 hours from now

- Re-fetch https://skills.sh/product-on-purpose/pm-skills
- Compare skill count (expect 35 to 38)
- Check whether the 6 foundation skills now appear with non-zero install counts
- Note the timestamp of the observed change for indexer-lag documentation

### Weekly for the next month

- Record total install count
- Record foundation-skill install counts (they started at 0 after v2.11.1 re-index)
- Note any leaderboard rank changes visible elsewhere on the site
- Evaluate whether install velocity justifies/requires Phase 5 soft-launch

---

## Revised framing for Phase 5

If Phase 5 soft-launch happens, the positioning changes based on this snapshot:

**Before**: "Here's a new PM skills collection. Install it to help it get off the ground."

**After**: "pm-skills just crossed 1.2K installs on skills.sh and shipped v2.11.1 with 6 new foundation skills previously unavailable. Here's what's new and how to install."

The revised pitch carries more credibility (social proof of existing traction) and frames v2.11.1 as "improvement to an adopted tool" rather than "launch of an untested tool."

---

## Cross-references

- Full distribution plan: [`../2026-04-22_skills-sh.md`](../2026-04-22_skills-sh.md)
- Evergreen reference: [`../skills-sh.md`](../skills-sh.md)
- v2.11.1 release notes: [`../../../releases/Release_v2.11.1.md`](../../../releases/Release_v2.11.1.md)
- Lint rules that prevent the YAML gotchas: [`../../../../scripts/lint-skills-frontmatter.md`](../../../../scripts/lint-skills-frontmatter.md)

---

## Update protocol

Future status snapshots in this folder should follow the naming pattern `current-status_YYYY-MM-DD.md`. They do not supersede this file; they accrete as a time series.

The canonical reference at `../skills-sh.md` should be updated to:
1. Remove the "zero installs, unlisted repo" framing
2. Add a pointer to this status snapshot as the corrective record
3. Document the indexer-lag window once the 38-skill update propagates
