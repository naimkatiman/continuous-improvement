# 2026-09-06 — Site + repo: complete, lovable, simple

**Branch:** `feat/lovable-site-repo` (worktree `D:\Ai\ci-wt-lovable`)
**Base:** `origin/main` @ v3.23.0 (`942746f`)
**Owner ask:** make continuous-improvement.dev and the repo more complete, lovable and simple; real value, not generic AI copy; anchor the philosophy of intelligence on the hadith of self-accounting (muhasabah) with the 7 Laws as the implementation; cherry-pick from trending repos.

## Ground truth found before any edit

- Live site serves `REV 3.21.0`; `package.json` on main is `3.23.0`. The `landing-drift.yml` check has failed daily since at least 2026-09-02. The site is two releases stale because Cloudflare Pages is direct-upload and nobody ran the deploy. Deploy is owner-gated (production).
- The landing's install story contradicts itself: hero and CTA show `npx continuous-improvement install`, the line beside it says "No Node setup", the CTA headline says "Two slash commands", and README's Beginner path is the two `/plugin` commands. QUICKSTART warns that running both paths duplicates state.
- Five "spec" boxes in the Enforcement section are invented pseudo-output marked `aria-hidden`. The real strings exist: `hooks/gateguard.mjs` emits a `permissionDecision: deny` JSON with a four-item fact list; the destructive-Bash reason is a fixed three-item text.
- Three enforcement claims overstate defaults: goal-drift warns by default (blocks only under `CLAUDE_GOAL_DRIFT_GATE=block`), recall briefing is opt-in (`CLAUDE_RECALL_BRIEFING=1`), and the gate is honor-system once the agent runs the printed clear command. `verification-loop` is a skill, not a hook.
- The learning promise ("the same mistake does not return next session") is unconditional on the site but README itself says capture is silent and instincts only form when `/seven-laws` runs.
- Unsourced numbers: "~90% of users", "nearly every install support thread", "67% of recent messages".
- `Mulahazah` is never translated on either surface.
- Host finding, not shipped: this machine's global `settings.json` sets `CI_GATEGUARD_EXCLUDE="/,."`, which matches every path and silently disables the Edit/Write gate. The hook says nothing when an exclusion fires. Recorded in auto-memory; a follow-up PR makes the exclusion observable.

## Research inputs

- Workflow `wf_2c160aa2-6ef`: 7 trending-repo lenses (56 raw findings, 52 unique repos), 3 site critics (first visitor, philosophy, skeptic), 1 lovable-pages pattern scout (11 sources), 1 source check. Verification + synthesis reran after a session-limit failure; results summarised in the Cherry-picks section below.
- Sources verified first-hand for the philosophy copy: Jami` at-Tirmidhi 2459 (Tirmidhi: hasan; al-Albani: da'if), Sunan Ibn Majah 4260, Umar's saying in Tirmidhi's own gloss; al-Ghazali Ihya Book 38 six stations via Abdallah Rothman (Cambridge Muslim College) and the Islamic Texts Society edition listing.

## In scope (this PR, docs + landing + one skill-text touch)

1. `docs/landing/index.html` rebuilt as one static file, same palette/fonts/a11y, same four version markers `bin/check-landing-version.mjs` greps, same `#laws` and `#enforcement` anchors:
   - Hero: problem in one breath, the two `/plugin` commands as the primary install (copy button), npx demoted to Expert with the Node precondition, nav Install points at `#install`.
   - Proof panel in the hero: the literal deny JSON captured from `hooks/gateguard.mjs` v3.23.0 and the literal destructive-Bash reason. No mocks, no `aria-hidden` decoration.
   - `00 · Why`: "Audit yourself, or hope." The hadith in English with Arabic and Malay beneath, citation, "every red flag is a wish", the secular one-line test, link to `docs/philosophy.md`.
   - `01 · The seven laws`: keep the Check / Red-flag clauses, group them before / during / after the act, keep "A failure never carries forward".
   - `02 · What actually runs`: every card labelled with its true status (default on, warn by default, off by default, opt-in, skill, on-demand) and a "What it cannot do" block.
   - `03 · How you benefit`: the three rungs; "Beginner install alone does not learn."
   - Install section with three plain blocks (Claude Code, Expert npx, other agents), "Skip it if", and "What leaves your machine: nothing."
   - Strip with checkable values only (1 gate on by default, 29 skills, 0 runtime deps, 1,137 tests, MIT, v3.23.0). Nav badge links to the changelog with the 3.23.0 headline. Footer links to docs, examples, changelog, philosophy, security.
   - `og:image` / `twitter:image` from `social-preview.png` copied into `docs/landing/` (CF Pages deploys only that directory).
2. `docs/philosophy.md` (new): the sentence, both gradings, the two-agents table, the red-flag mapping, the al-Ghazali four-phase mapping labelled as ours, the two names.
3. `README.md`: latest-release line; honesty paragraph under the 7 Laws table (gate forces the form of research, not honesty; the ledger settles by outcome); Mulahazah explained in the brand stack; `CI_GATEGUARD_EXCLUDE` and `CI_GATEGUARD_TARGET_LOCK` rows in Operator modes; "What leaves your machine" promoted out of the Expert details; unsourced percentages removed; More list gains philosophy, changelog and bug reporting; the real deny JSON under the demo image with an honest caption. Locked substrings, skill-count prose and runtime-claim anchors preserved.
4. `QUICKSTART.md`: same "~90%" and "no Node" corrections.
5. `commands/discipline.md`: before / during / after frame under the Laws table, sixth self-check box ("checked, not hoped"), the forward-looking half of the why.
6. `SKILL.md`: one sentence under Law 4 and one under Law 5 making "done" an audit and the reflection block a ledger. No scripture in the agent-facing spec.
7. `llms.txt`: philosophy pointer and the honest gate sentence.

## Out of scope (logged, own PRs)

- Deploy to Cloudflare Pages (`wrangler pages deploy docs/landing --project-name=continuous-improvement --branch=main`). Owner runs or approves it; the drift check stays red until then.
- Gateguard observability: warn on a catch-all `CI_GATEGUARD_EXCLUDE`, a stderr line per exclusion, `/verify-install` flags an excluded gate. Shipped as #300.
- Destructive-Bash matcher hardening (`rm -r -f`, `git clean -f*`, `git checkout -- .`, `git restore .`, `find -delete`, `+refspec`, `git stash drop`) with table tests and a `Matched rule:` line. Shipped as #301. Bash file-write gating (`> file`, `tee`, heredoc) is a deliberate non-goal, since the operator's own workflow writes through Bash, and is disclosed as a limit instead.
- Mulahazah decay: either implement the 30-day decay in code or relabel it as a model-side instruction in SKILL.md.
- Cherry-picks from the research sweep, ranked below once verification completes.

## Cherry-picks (from the verified sweep, 27 of 52 repos survived adversarial verification)

Ranked by `(value × novelty) / effort` from the verdicts, not the raw findings. Full ranking, rejected duplicates with the covering file, and companion-refresh notes are in the PR description.

| # | Source (stars, pushed) | What we would build here | Law | Effort | Status |
|---|---|---|---|---|---|
| 1 | karanb192/claude-code-hooks `config-guard` (499, 2026-09-05, MIT) | `hooks/config-guard.mjs`: PreToolUse deny/warn on any mutation of `.claude/settings*.json`, `.mcp.json`, `hooks.json`, the installed plugin root. Today the agent can edit the file that wires every gate with no hook in the way. | all 7 | S | shipped as #302 (warn by default, `CI_CONFIG_GUARD=block` to deny) |
| 2 | Dicklesworthstone/destructive_command_guard (5,921, 2026-09-04) | `bin/gateguard-explain.mjs "<cmd>"` prints which rule fires and the JSON the hook would emit; single-use allow-once code in the destructive deny so the hard deny has an audited clearance route. | 4 / 1 | S | logged; the `Matched rule:` line shipped in #301 |
| 3 | trailhq/Graft blast radius (5,604, 2026-09-05, MIT) | PostToolUse `hooks/blast-radius.mjs` (opt-in) computes the importers the gateguard fact list asks the agent to grep for. | 1 | S | logged |
| 4 | mattpocock/skills `retro` (2026-09-04, MIT) | seven-category environment retro appended to the `ci_reflect` template and `/seven-laws`. | 5 | S | logged |
| 5 | agent-sh/agnix (404, Apache-2.0) | `verify:agent-config` linting hooks.json paths/timeouts and SKILL.md lengths. New external dependency: ask first. | 4 | S | needs owner yes |
| 6 | tigerless-labs/autoharness lifecycle (1,997, MIT) | opportunity-relative instinct lifecycle (use/view counters, probation, archive) replacing the prose-only 30-day decay. | 7 | M | logged |
| 7 | DietrichGebert/ponytail (MIT) | `SubagentStart` hook re-injecting the 7 Laws and the plan goal into every subagent; SKILL.md promises this and nothing enforces it. | 3 | M | logged |
| 8 | thedotmack/claude-mem `sensitive` rows (Apache-2.0) | `sensitive: true` on observation rows matching a user pattern file; recall and export skip them. | 1 | S | logged |
| 9 | Austin1serb/agents-md byte caps | switch `verification-loop` line caps to byte caps (`head -c`). | 3 | S | logged |
| 10 | rohitg00/agentmemory bench (28,070, Apache-2.0) | committed recall corpus + P@5/R@5 regression invariant for the BM25 index. | 4 | M | logged |
| 11 | lennney/stop-that-shit task contract (1,627, MIT) | `/contract review\|change files=…` prompt prefix + PreToolUse deny; gives `safety-guard` its promised runtime edge. | 3 | M | logged |
| 12 | addyosmani/agent-skills floor-guard (MIT) | `bin/floor-guard.mjs`: diff-scoped detector of bar-lowering (skipped tests, removed assertions, empty catch). | 4 | M | logged |

Own findings, shipped as their own PRs (#300 for the exclusion notice, #301 for the structured classifier): `CI_GATEGUARD_EXCLUDE` observability (S), destructive-matcher forms `rm -r -f`, `git clean -f*`, `git checkout -- .`, `git restore .`, `find -delete`, `git push +ref`, `git stash drop` (S). Bash file-write gating is a deliberate non-goal on this host (the operator's own workflow writes through Bash) and is disclosed as a limit instead.

Companion snapshots behind upstream: obra/superpowers pinned 5.1.0 vs v6.3.0 (review-fix circuit breaker), oh-my-claudecode 4.13.6 vs v5.2.0 (17 aliases retired, drift radar must be re-read), addyosmani/agent-skills 1.0.0 vs 0.6.9 manifests (constraint-driven-development), mattpocock/skills (retro, implement-spec). Each refresh is its own PR via `bin/refresh-third-party.mjs`.

## Verification

- `npm run build` then `npm run verify:all` (17 invariants incl. landing-version, docs-substrings, skill-count-prose, doc-runtime-claims, everything-mirror) green.
- `CI_GATEGUARD_EXCLUDE= node --test test/*.test.mjs` green (the host env var otherwise fails 16 gateguard tests; Linux CI is unaffected).
- Landing opened locally; every anchor, copy button and link resolves; no console errors.
- `git diff --stat` reviewed by file before staging by explicit filename.
