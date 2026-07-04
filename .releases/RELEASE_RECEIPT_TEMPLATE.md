# Release Receipt

> One receipt per release/deploy. Copy this file to `.releases/<YYYY-MM-DD>-<version-or-slug>.md`, fill every field, commit it with the release. A release without a receipt did not happen.
> Deploy-verification companion: [skills/deploy-receipt.md](../skills/deploy-receipt.md) — run it at deploy time to capture the verification evidence this receipt records.

## Identity

| Field | Value |
|---|---|
| Repo | |
| Version / tag | |
| Commit SHA | |
| Environment | production / staging / preview |
| Released at (UTC) | |
| Owner | |

## What shipped

- User-visible impact (one sentence, outcome not mechanism):
- Feature flags changed (name, old value, new value):
- Migrations run (file names, or "none"):

## Verification

- Tests run (exact commands + result):
- Security scans run (tool + result, or "none"):
- Manual verification performed:

## Risk

- Known risks accepted at release time:
- Rollback command (exact, copy-pasteable):
- Monitoring link (dashboard/logs to watch after release):

## Sign-off

- [ ] All fields above are filled (no blanks — use "none" explicitly)
- [ ] Rollback command was verified to exist (not just guessed)
