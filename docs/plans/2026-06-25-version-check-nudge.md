# 2026-06-25 — Update-available version-check nudge (npx/expert path)

- Status: in progress
- Origin: gstack-feasibility deep-research, capability 3. Companion finding (marketplace.json `version` field) tracked separately, see below.

## Goal

Tell an `npx`/npm-installed user when a newer `continuous-improvement` is available,
without telemetry and without surprising the broad marketplace population. The
marketplace/beginner path is already covered by Claude Code's native plugin
auto-update; the real gap is the npm/CLI install path, which has no update signal.

## Why this scope (and what it is NOT)

- **Marketplace users are out of scope.** Claude Code auto-updates marketplaces at
  startup and `/plugin marketplace update` is already documented in the README. We
  do not add a bundled session hook that phones a registry for those users.
- **`npx`-always-latest is never stale.** `npx continuous-improvement install`
  resolves `@latest` before running, so the install command itself is current. The
  genuinely-stale population is a *globally or locally installed* binary
  (`npm i -g continuous-improvement`, or a project devDependency) whose on-disk
  version lags the registry.
- **Therefore: wire the check into the installer's completion path.** It runs only
  when the user explicitly invokes our CLI, so a one-line "newer version available"
  notice is expected behavior (the way npm itself notifies), not a surprise outbound
  call. No new always-on hook. `unified-cli.mts` is intentionally NOT used as a wire
  point — its `import.meta.url === file://...` main guard does not fire under
  `node bin/x.mjs` on Windows (separate latent bug).

## Design (reuse first — Law 1)

`src/lib/version-check.mts` — pure decision core, all I/O injected so it is unit-
testable offline (mirrors how goal-state / recall scorers are structured):

- `parseSemver(v) → [maj,min,patch] | null` — fail closed on non-semver.
- `isNewer(remote, local) → boolean` — strictly greater only (never nudge a dev
  install running ahead of the registry).
- `isThrottled(cache, now) → boolean` — two-tier TTL copied from gstack: 60 min when
  up-to-date, 720 min when an upgrade is pending. NaN/absent `checkedAt` → not
  throttled (fetch).
- `pendingNotice(cache, local) → string | null` — re-surface a still-valid pending
  upgrade from cache without re-fetching, so the nudge is not lost between fetches.
- `evaluateUpdateCheck({ local, remote, now }) → { status, notice, nextCache }` —
  `remote === null` ⇒ status `unknown`, no notice, no cache write (retry next run);
  `!isNewer` ⇒ `up-to-date`; `isNewer` ⇒ `upgrade-available` + notice + cache.
- `fetchLatestNpmVersion(pkg, { fetchImpl?, timeoutMs? }) → Promise<string | null>` —
  the only network: GET `https://registry.npmjs.org/<pkg>/latest` with
  `Accept: application/vnd.npm.install-v1+json` and `AbortSignal.timeout` (default
  5s). Any throw / non-2xx / non-semver body ⇒ `null` (fail closed).

`src/bin/install.mts` — after the final install summary, `await maybeNotifyUpdate()`:
read cache from `~/.claude/instincts/global/update-check.json`; if `isThrottled`,
print `pendingNotice` (if any) and return; else fetch, evaluate, print
`decision.notice`, persist `decision.nextCache`. Wrapped so it can never throw or
change the installer's exit status.

## Decisions

- **Default ON, off-switch `CLAUDE_CI_UPDATE_CHECK=off`.** Defensible because the
  check fires only when the user runs our installer. (Considered: default-off opt-in
  like recall-briefing — rejected here because an install-time version notice is
  expected and low-surprise, and default-off would give it near-zero reach.)
- **No telemetry.** A one-way read of the public npm registry; no installation id,
  no Supabase ping (unlike gstack). Nothing to opt out of beyond the check itself.
- **Source of truth = `package.json` version** (already exported as `VERSION` from
  `plugin-metadata.mts`); no separate `VERSION` file.

## Files

- `src/lib/version-check.mts` (new) → `lib/version-check.mjs`.
- `src/test/version-check.test.mts` (new) — pure-core table + injected-fetch helper.
- `src/bin/install.mts` — import + `maybeNotifyUpdate()` at install end.
- `README.md` — install/update note + operator-modes off-switch row.
- Generated (via `npm run build`): mirror + manifests.

## Fail-closed / boundary tests (the 2026-06-03 audit lesson)

empty cache; NaN/undated `checkedAt`; `remote < local`; equal versions; non-semver
registry body; fetch throw / non-200 → `null`; throttle boundary exactly at TTL.

## Verification

`npm run build` → `node --test test/version-check.test.mjs` → `npm run verify:all`
→ idempotent rebuild leaves no drift.

## Deferred (fast-follow, not this PR)

- Snooze levels (24h/48h/7d) and any auto-apply.
- Broader wire points (a SessionStart nudge for marketplace users whose third-party
  marketplace auto-update is OFF) — needs the default-on-network decision separately.

## Companion finding (separate decision, NOT in this PR)

`.claude-plugin/marketplace.json`'s per-plugin `version` field may key the Claude
Code plugin cache on the version string and suppress native `/plugin update`
auto-detection for our (third-party) marketplace
([everything-claude-code#36](https://github.com/affaan-m/everything-claude-code/issues/36)).
Decision to make on its own: keep the pin and document toggling auto-update ON, vs
drop the field for git-SHA versioning. Logged so it is not lost; out of scope here
per One-Thing-at-a-Time.
