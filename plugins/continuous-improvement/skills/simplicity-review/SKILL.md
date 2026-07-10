---
name: simplicity-review
tier: "2"
description: Enforces Law 4 (Verify Before Reporting) of the 7 Laws of AI Agent Discipline. Reviews the current diff for over-engineering (code that could reuse an existing file, a stdlib or native feature, or fewer lines) and reports trim findings without touching code, so 'it works' is never mistaken for 'it is the minimum that works'.
origin: continuous-improvement
user-invocable: true
---

# Simplicity Review — Flag the Over-Build Before It Ships

Law 4 says verify before reporting. "It compiles and the test passes" is a claim about correctness, not about whether the change is the minimum that works. This skill runs a diff-scoped review with one question: could this have been smaller? It reads the change like the laziest senior dev in the room, walks a fixed reuse ladder, and reports what to trim. It never edits code. The best code is the code you never wrote.

## When to Activate

- After writing a feature or fix, before opening a PR, when the diff feels larger than the task warranted.
- When you reached for a new file, a new dependency, or a wrapper component and a native or existing option might already cover it.
- As a routed step from `proceed-with-the-recommendation` at the "Refactor / dead code cleanup" line, as the repo-owned alternative to the built-in `simplify`.
- Before a release cut, over the diff since the last tag, as a last pass on accreted complexity.

## The Ladder

Read each added or changed block and stop at the first rung that holds:

```
1. Does this need to exist?   -> skip it (YAGNI)
2. Already in this codebase?  -> reuse it
3. Stdlib does it?            -> use it
4. Native platform feature?   -> use it
5. Installed dependency?      -> use it
6. One line?                  -> one line
7. Only then:                    the minimum that works
```

Most real cuts come from rungs 2 to 4: a hand-rolled helper that duplicates an existing one, a component built where a native input, a stdlib call, or a platform primitive already does the job.

## Read Before You Cut

Lazy about the solution, never about the reading. The ladder shortens the solution, not the investigation. Trace the whole change and what it touches first. A "simpler" path proposed without reading the surrounding code is a guess, and a wrong trim is worse than the over-build.

## Safety Carve-Out (Never Flag)

Lazy, not negligent. These are never on the chopping block, no matter how many lines they cost:

- Input validation at trust boundaries.
- Error handling that prevents data loss.
- Security controls (authz checks, escaping, secret handling).
- Accessibility.

This aligns with `rules/common/security.md` and `rules/common/coding-style.md`. If a trim would weaken any of the above, it is not a finding.

## Output

A findings list. For each item:

- `file:line`
- `over-built:` what the code does the long way
- `simpler:` the specific shorter path (reuse existing `X` / stdlib `Y` / native `Z` / one line / delete)
- one-line rationale

Close with a verdict:

- `GO` — the diff is already at or near minimal; nothing to trim.
- `TRIM` — findings listed above; apply, then re-verify.

No score, no line-count target. A net-negative diff is a nice side effect, not the goal. Optimizing for fewer lines invites golfing and deletion of things that earn their keep; the ladder, not a number, decides.

## Review Only

This skill reports; it does not edit. Apply the trims yourself or route them through `proceed-with-the-recommendation`, then run the `verification-loop` ladder on what changed. This mirrors `audit`'s confirm-before-fix: a finding is a hypothesis until the simpler path is proven to exist and to preserve behavior.

## Overlap With `simplify`

The Claude Code built-in `simplify` and this skill share intent but differ in kind. `simplify` auto-applies broad reuse, efficiency, and altitude cleanups across changed code. `simplicity-review` is a repo-owned, Law-4-tagged, review-only lens scoped to over-engineering in the current diff, with an explicit safety carve-out, that feeds its findings into the 7-Laws flow. Use `simplify` when you want the fixes applied; use `simplicity-review` when you want the diff judged first.

## Pairs With

- **`verification-loop`** (Law 4) — the build/test/lint ladder you run after applying a trim.
- **`gateguard`** (Law 1) — the write-time reuse gate ("confirm no existing file serves the same purpose"); this skill catches at review time what slipped past it.
- **`proceed-with-the-recommendation`** — applies the trims under the 7 Laws.
- **`wild-risa-balance`** (Law 2) — the recommendation-layer analog: the same anti-padding instinct applied to advice instead of code.
