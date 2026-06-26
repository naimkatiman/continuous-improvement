# 2026-06-25 — Behavioral eval harness (Tier B prototype)

- Status: planned (not yet implemented) — prototype-first
- Origin: gstack-feasibility deep-research, capability 2.

## Goal

Add a **behavioral, agent-in-the-loop** eval for our own skills/hooks/7-Laws to
complement the 12 deterministic content-invariant linters. It runs a scenario
through a real headless Claude (`claude -p --output-format stream-json`), parses the
NDJSON tool-call trajectory, and asserts the agent actually obeyed the discipline
(e.g. gateguard blocked, verification-loop ran). Deterministic-first; the LLM-judge
tier stays opt-in and out of default CI.

## The reframe: most of this is already deterministic

- `test/gateguard-hook.test.mjs` already proves "did gateguard emit the right deny
  JSON" by spawning the hook with a payload on stdin. Same for goal-drift,
  route-prompt, three-section-close, companion-preference. **"Did the HOOK fire
  correctly" is already a solved unit test and must stay one — it does not need an
  LLM.**
- `test/mcp-server.test.mjs` already spawns a long-lived subprocess and parses
  NDJSON line-by-line with a hand-rolled buffer drainer. **That is the stream-json
  reader gstack ships as session-runner.ts** — reuse it, do not add a dependency.
- The genuine gap is only the top slice: in a REAL session, does the running model
  OBEY the skill text. Everything below (hook I/O, manifest shape, doc claims) is
  already deterministic and stays there.

## Three tiers (deterministic-heavy, LLM-judge thin and quarantined)

- **Tier A (exists, keep):** the 12 `bin/check-*.mjs` invariants + the hook-spawn
  unit tests are the floor. "Did the hook emit the right deny JSON" is settled here,
  never in an LLM.
- **Tier B (the new work — STILL deterministic, no API key):**
  `bin/run-skill-eval.mjs` spawns
  `claude -p --bare --plugin-dir plugins/continuous-improvement
  --append-system-prompt-file <skill-under-test> --output-format stream-json
  --verbose --permission-mode dontAsk --max-turns N`, feeds a scenario prompt that
  baits the discipline (e.g. "edit src/index.mts right now" → gateguard; "deploy
  then say done" → verification-loop/deploy-receipt), parses the NDJSON with the
  buffer-drainer from `test/mcp-server.test.mjs`, and asserts on the **trajectory +
  result**: did a Write/Edit `tool_use` appear before the grounding facts? did
  `system/init.plugin_errors` stay empty (plugin loaded)? did the final result text
  contain the 3-section close? These are outcome/trajectory asserts (per Anthropic:
  grade the produced trajectory, not a rigid tool order
  [demystifying-evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)),
  pass/fail by exit code. The model call costs tokens, so Tier B is opt-in
  (`CI_EVAL=1`), never in default CI.
- **Tier C (LLM-judge — thin, cost-gated, NEVER in CI by default):**
  `bin/judge-skill-eval.mjs` takes a Tier-B transcript + a per-skill rubric and
  calls the Anthropic API over plain `fetch` (no SDK dep), one isolated 1-5 judge
  PER dimension with an "Unknown" escape hatch, with a deterministic regex pre-pass
  so the judge only scores the subjective axis (gstack's layered llm-judge pattern).
  Run only when `CI_EVAL=1 && ANTHROPIC_API_KEY`. Variance via pass@k over 3 trials.

## Headless primitive (official)

`claude -p` print mode; `--output-format stream-json --verbose` emits NDJSON
including `assistant` tool_use and a final `result` event; `--bare` skips
auto-discovery and takes only explicit `--plugin-dir` / `--append-system-prompt-file`
/ `--settings`; `system/init` reports loaded `plugins[]` + `plugin_errors[]` — usable
to fail when our plugin did not load
([headless docs](https://code.claude.com/docs/en/headless)).

## Zero-dependency posture (non-negotiable)

`child_process` + global `fetch` + `node:test` only. Do NOT pull in
`@anthropic-ai/sdk`, `bun:test`, or `promptfoo` — each is a heavy dep and/or a
runtime/test-runner swap that breaks our `node --test` + `.mts`→`.mjs` pipeline.

## Files (prototype: ONE scenario first)

- `src/bin/run-skill-eval.mts` → `bin/run-skill-eval.mjs` (reuses the NDJSON
  buffer-drainer pattern from `test/mcp-server.test.mts`).
- `evals/scenarios/gateguard-edit-without-research/` — scenario.json + expectation
  (modeled on the `synthetic-checks/` one-file convention).
- `package.json` script `eval:behavior` (gated on `CI_EVAL=1`), kept OUT of
  `verify:all` and the default `npm test`.
- Deferred to later PRs: Tier C `bin/judge-skill-eval.mjs`, an `evals/touchfiles.json`
  diff-selection map, a `/eval-skills` command (with its count cascade), and a
  weekly GitHub Actions workflow holding `ANTHROPIC_API_KEY`.

## Risks / constraints

- **Cost + flakiness:** every Tier B/C scenario is a real billed model call;
  pass@3 multiplies it. Mitigate with the `CI_EVAL` default-off gate, diff-based
  touchfile selection, a weekly-only full matrix, and outcome-not-process asserts
  (don't pin exact tool order).
- **Windows:** the `claude -p` spawn must use the CRLF-tolerant NDJSON reader
  already proven in `test/mcp-server.test.mts`; no `jq` (parse in Node).
- **Hook obedience is the subtle trap:** the deny itself is already deterministic in
  the hook unit test, so Tier B asserts on the agent's RESPONSE to a fired hook, not
  a re-test of the hook.
- **Fail-open:** a missing `ANTHROPIC_API_KEY` or `claude` binary must SKIP, never
  fail the suite.

## Why prototype-first

The open risks (Windows `claude -p` spawn reliability, real flake rate, per-run cost)
are empirical, not designable. Build Tier B as ONE scenario (gateguard: "edit a file
now"), prove the loop end-to-end on the Windows host, measure cost/flake, THEN
generalize. Defer Tier C until Tier B is green — most of what the user fears ("did
gateguard block, did the drift gate fire") is already deterministic.

## Effort

L (1-2 weeks) for the full harness; the prototype slice is ~1-2 days.
