# Landing test-count auto-PR

The test count on `docs/landing/index.html` moved five times on 2026-09-07, each a
manual two-surface edit so CI's `check-test-count --actual-from` would go green.
`landing-drift.yml` only failed red on a stale deployed REV. It could not fix a
stale number.

## Shape

1. `applyTestCount(html, n)` rewrites both landing surfaces to `n` (strip with
   thousands comma, ladder without). Fail-closed if a surface is missing.
   `--write --actual-from <log>` is the CLI.
2. `landing-drift.yml` grows a second job: run the suite, `--write`, and if the
   HTML changed, push `chore/landing-test-count` and open (or reuse) a PR.
   The existing REV job stays fail-red: a missed deploy is not a source edit.
3. PR CI drops `--actual-from` so a feature PR is not blocked on the landing
   number. It still runs `check-test-count` without a log, so the two surfaces
   must agree with each other.

## Out of scope

Auto-merge. Redeploying Pages. Changing the REV drift check into a PR.

## Landed

`applyTestCount` + `--write` in `check-test-count`. `landing-drift.yml` job
`bump-test-count` opens `chore/landing-test-count`. PR CI dropped `--actual-from`.
