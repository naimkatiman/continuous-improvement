# Skill Hardening — Behavioral Specs, Hook Telemetry, Composition

- Date: 2026-04-29
- Branch: `harden-skills`
- Author: Naim
- Slug: `skill-hardening`

## Goal

Lock down the three recently shipped skills so a regression in `main` cannot ship undetected:

1. `proceed-with-the-recommendation` (P-MAG, Phase 7 close shape)
2. `wild-risa-balance` (5+2 floor + composition rules)
3. `three-section-close` Stop hook (block/pass behavior)

Current tests are static literal-substring checks. They confirm a heading or phrase still exists; they do not confirm the skill's *behavioral spec* (what the skill obligates the agent to do) is intact, nor do they catch hooks that silently degrade.

## Non-goals (YAGNI)

- No live-agent eval harness (Claude API calls). Out of scope. Cost + flakiness not justified for this pass.
- No new runtime dependencies. CI's "Verify zero runtime dependencies" gate is sacred.
- No reformat / rename / refactor of unrelated SKILL.md content.
- No telemetry beyond JSONL counts. No dashboards, no remote sinks, no PII.
- No false-positive-rate computation for hooks (requires labeled feedback we don't have).
- No coverage of skills not in the three-skill scope.

## Approach (recommended, vs. alternatives)

Three approaches considered:

- **A. Behavioral-spec tests (parse SKILL.md, assert structure beyond literals)** + **fixture-replay tests against the hook script** + **JSONL hook telemetry**. All three additive, zero-runtime-dep, runs under existing `node --test` harness. **CHOSEN.**
- B. Live-agent eval via Claude API. Highest fidelity, but adds runtime dep, adds cost, adds flakiness. Punt.
- C. Pure literal-substring expansion (more grep tests). Cheapest, but does not actually catch behavioral drift — same failure class as today.

Trade-off accepted: behavioral-spec tests assert on parsed structure (sections, sub-rules, required clauses), not on actual agent behavior. They catch SKILL.md edits that silently drop a rule or weaken a verb. They do not catch a model that ignores a still-intact rule. That second failure class needs a live eval, which is out of scope.

## Tracks and tasks

### Track A — Behavioral drift (3 tasks)

#### A1. P-MAG behavioral spec test

- **WILL build:**
  - New file `src/test/pmag-spec.test.mts` → emits `test/pmag-spec.test.mjs` via `npm run build`.
  - Parses Phase 0 section in both source skill (`skills/proceed-with-the-recommendation.md`) and plugin mirror (`plugins/continuous-improvement/skills/proceed-with-the-recommendation/SKILL.md`).
  - Asserts each of the three rules has its required behavioral clauses:
    - **Rule 1** must reference `observations.jsonl`, `Past Mistake` quote-line format, and the empty-surfaces fallback `No prior mistakes recorded — proceed.`
    - **Rule 2** must contain `BLOCKED on prior mistake:` halt prefix and the three residue triggers (residue in working tree / unrun verification / unresolved `needs-approval`).
    - **Rule 3** must require `Will NOT repeat:` carried into Phase 2 with a *specific prior session* citation requirement (not generic).
- **Will NOT build:** any test that hits the network, spawns an agent, or modifies SKILL.md.
- **Files touched:** `src/test/pmag-spec.test.mts` (new), `test/pmag-spec.test.mjs` (generated, must be committed per CI).
- **Verification:** `npm test` passes locally; deliberately edit one of the asserted clauses out of SKILL.md and confirm the new test fails; revert.
- **Acceptance:** All three Rule-level assertions exist and run on both mirrors. Test fails if any single rule's required clause is removed.

#### A2. Wild/RISA behavioral spec test

- **WILL build:**
  - New file `src/test/wild-risa-spec.test.mts` → emits `test/wild-risa-spec.test.mjs`.
  - Parses `How to Apply in a Recommendation List` section in both mirrors.
  - Asserts:
    - 4 numbered sub-rules present.
    - "exactly 2" present in WILD rule, "at least 5" present in RISA rule.
    - "rank descending by impact" present.
    - "Never auto-trigger" wording present.
    - The "Example" block contains exactly 2 WILD entries and 5 RISA entries (parsed from numbered list under each header).
- **Will NOT build:** assertions on the philosophical sections (The Trap, Switching Deliberately) — those are explanatory, not normative.
- **Files touched:** `src/test/wild-risa-spec.test.mts` (new), `test/wild-risa-spec.test.mjs` (generated).
- **Verification:** same pattern — edit "exactly 2" → "at least 1", confirm test fails, revert.
- **Acceptance:** All structural claims asserted. Test fails on any silent softening.

#### A3. Phase 7 close-shape spec test

- **WILL build:**
  - New file `src/test/phase7-close-spec.test.mts` → emits `test/phase7-close-spec.test.mjs`.
  - Parses Phase 7 section in both mirrors.
  - Asserts:
    - Three section headings present in this exact order: `What has been done`, `What is next`, `Recommendation`.
    - Tier 1 / Tier 2 / Skip table structure required.
    - Tier 1 mandates citation (literal `concrete file/line/rule citation` or equivalent).
    - `Want me to:` block requires exactly 2 options.
    - Tiny-list exemption clause present (≤1 item path).
- **Will NOT build:** assertions on the worked example block — that's illustrative, not normative.
- **Files touched:** `src/test/phase7-close-spec.test.mts` (new), `test/phase7-close-spec.test.mjs` (generated).
- **Verification:** same flip-and-revert pattern.
- **Acceptance:** All five structural claims asserted on both mirrors.

### Track B — Hook telemetry (2 tasks)

#### B1. JSONL telemetry sink in `three-section-close.mjs`

- **WILL build:**
  - Modify `hooks/three-section-close.mjs` to append one JSONL line per invocation to `~/.claude/instincts/<project-hash>/hook-telemetry.jsonl` (use `process.env.HOME` or `process.env.USERPROFILE`; on missing env, no-op silently).
  - Line shape: `{"ts":"<ISO>","hook":"three-section-close","action":"pass|block|skip","textLength":<n>,"missing":[<heading...>],"durationMs":<n>}`.
  - Must be fail-open: telemetry write failure must not block the response or throw.
  - Must remain zero-runtime-dep: only `node:fs`, `node:path`, `node:crypto` for hashing project path.
  - Project hash: `crypto.createHash('sha256').update(cwdOrTranscriptDir).digest('hex').slice(0, 12)`.
- **Will NOT build:**
  - No remote sink. No environment-variable-driven endpoint. No PII (no transcript content captured — only metadata).
  - No telemetry on the failure-to-parse-stdin path (already noisy).
- **Files touched:** `hooks/three-section-close.mjs` (modify), `src/test/hook.test.mts` (extend with telemetry assertion using a temp HOME), `test/hook.test.mjs` (generated).
- **Verification:** spawn the hook with a synthetic stdin payload pointing at a fake transcript, confirm JSONL line appears at expected path, confirm hook still exits 0/blocks correctly.
- **Acceptance:** Telemetry written on pass + block + skip paths. Hook still fail-open on telemetry-write errors. Zero-deps gate still green.

#### B2. `bin/hook-stats.mjs` reader + npm script

- **WILL build:**
  - New file `src/bin/hook-stats.mts` → emits `bin/hook-stats.mjs`.
  - Reads `~/.claude/instincts/<hash>/hook-telemetry.jsonl`, prints one-line summary per hook: `<hook> last <hours>h: pass=N block=M skip=K avg-duration=Xms`.
  - Args: `--hours=<n>` (default 24), `--hash=<hash>` (default = current cwd hash).
  - New `npm run hooks:stats` script in `package.json`.
  - New file `src/test/hook-stats.test.mts` → emits `test/hook-stats.test.mjs`. Synthesizes a tiny JSONL fixture in a temp dir, points the script at it, asserts on stdout shape.
- **Will NOT build:** no JSON output mode, no per-day breakdown, no global aggregate across hashes.
- **Files touched:** `src/bin/hook-stats.mts` (new), `bin/hook-stats.mjs` (generated), `package.json` (script entry only — single line), `src/test/hook-stats.test.mts` (new), `test/hook-stats.test.mjs` (generated).
- **Verification:** populate a temp JSONL with 10 lines (5 pass, 3 block, 2 skip), run `npm run hooks:stats -- --hash=<temp>`, assert numbers match.
- **Acceptance:** Stats command runs without runtime deps, prints expected counts, test green.

### Track C — Composition (1 task)

#### C1. Compound fixture + cross-skill contract test

- **WILL build:**
  - New file `src/test/composition-spec.test.mts` → emits `test/composition-spec.test.mjs`.
  - Two parts:
    - **Part 1 — fixture replay against the hook.** Spawn `node hooks/three-section-close.mjs` with stdin payloads pointing at fixture transcripts saved under `test/fixtures/three-section-close/`. Three fixtures: (a) good reply with all three sections → hook exits 0, no block; (b) reply missing Recommendation → hook emits `decision: block` with reason naming `Recommendation`; (c) short reply (<600 chars) → hook exits 0, no block.
    - **Part 2 — cross-skill contract.** Assert that `proceed-with-the-recommendation` SKILL.md still references `wild-risa-balance` by name in the Phase 1 upstream-block-shape contract (the literal `2 WILD + at least 5 RISA` must appear in the Phase 1 section of both mirrors). Assert that `wild-risa-balance` SKILL.md still references `proceed-with-the-recommendation` as its execution arm.
- **Will NOT build:** fixtures of compound replies that simultaneously satisfy WILD/RISA + 3-section close. The hook only sees the assistant text — it cannot validate semantic compliance with the recommendation skill, only the close shape. Conflating them would invent guarantees the hook does not provide.
- **Files touched:** `src/test/composition-spec.test.mts` (new), `test/composition-spec.test.mjs` (generated), `test/fixtures/three-section-close/` (3 small JSONL fixtures, each one assistant message).
- **Verification:** run new test alone, confirm 3 fixture cases all behave as asserted; corrupt one cross-skill reference in SKILL.md, confirm test fails; revert.
- **Acceptance:** Hook-replay fixtures pass; cross-skill literal references guarded.

## Order

Sequential, one-task-per-subagent, two-stage review per task:

1. A1 (P-MAG behavioral spec) — establishes the parse-section-then-assert pattern other tasks copy.
2. A2 (Wild/RISA behavioral spec) — same pattern, different skill.
3. A3 (Phase 7 close-shape spec) — same pattern, third section.
4. B1 (Hook JSONL telemetry) — modifies a hook in production; needs care.
5. B2 (`hook-stats` reader + script) — depends on B1's JSONL shape.
6. C1 (Compound fixture + cross-skill contract) — depends on B1's hook still passing post-modification.

Each task = its own commit. No bundling. CI must stay green after each.

## Risks

- **CI's `git diff --exit-code -- bin test`** gate means every `.mts` change forces a `.mjs` regen + commit. Subagents must run `npm run build` before committing each task. Plan-doc-only commit is exempt (no source changes).
- **Skill-mirror parity:** every test assertion must run on both `skills/<name>.md` and `plugins/continuous-improvement/skills/<name>/SKILL.md`. Existing tests use a `MIRRORS` array; new tests must do the same.
- **Windows path handling:** project hash logic in B1 must work across Windows backslash and POSIX forward-slash paths. Normalize before hashing.
- **Hook telemetry write race:** concurrent invocations writing to the same JSONL. Use `appendFileSync` (atomic at the OS level for small writes); accept tiny risk of interleaved partial lines as not blocking — JSONL parser tolerates blank/garbled lines (B2 must skip unparseable lines).
- **Skill-tier lint** (`bin/check-skill-tiers.mjs`) currently runs on every change. New tests should not need to interact with it, but changes to SKILL.md frontmatter would. Plan: zero SKILL.md edits in this branch.

## Success criteria

- All 6 task commits land on `harden-skills`.
- `npm test` green locally.
- CI green on push (when authorized).
- Inverting a behavioral clause in any of the three skills causes the matching new test to fail.
- `npm run hooks:stats` returns counts after one real hook fire.

## Out of scope follow-ups (logged, not built)

- Live-agent eval harness (would need Claude API, budget, fixture model).
- Telemetry export / dashboard.
- Behavioral specs for skills outside the three-skill scope.
- False-positive labeling pipeline for hook telemetry.
