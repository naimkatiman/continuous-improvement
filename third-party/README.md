# third-party/

Cold-storage snapshots of external open-source projects related to the 7 Laws.

**These vendored snapshots are complementary, not integrated.** Nothing under this directory is loaded by `plugins/continuous-improvement/`, exposed via `.claude-plugin/marketplace.json`, or wired into our hooks. They live here so we can:

- Read what the upstream actually ships, without round-tripping to GitHub.
- Diff our 7 Laws assets against the upstream over time, so drift is visible.
- Decide later, on a case-by-case basis, whether to integrate, fork, or ignore.

## Read-only policy

Files copied from an upstream are kept **verbatim**. No edits, no fixes, no rewrites.

All annotations, opinions, and integration notes live in sibling files we author ourselves — typically `OUR_NOTES.md` next to each snapshot.

This is what lets us legally vendor Apache-2.0 code without triggering the "modification disclosure" obligation, and keeps MIT attribution clean.

## Layout

```
third-party/
├── README.md          ← you are here
├── MANIFEST.md        ← pinned SHAs, scope rationale, refresh protocol
└── <upstream>/
    ├── ...verbatim files from upstream...
    ├── LICENSE        ← preserved verbatim (mandatory)
    └── OUR_NOTES.md   ← our annotations, overlap analysis, NOT integrated list
```

## Refresh protocol

Snapshots are pinned by commit SHA in `MANIFEST.md`. To refresh:

1. Bump the pinned SHA in `MANIFEST.md`.
2. Re-run the same selective copy that originally landed the snapshot.
3. Update `OUR_NOTES.md` if the upstream's surface changed materially.
4. Single-concern commit, no other changes in the same commit.

## Refresh cadence

Refresh is a scheduled check, not an open-ended chase upstream.

- **Cadence:** on the first business day of each month, the maintainer compares the pinned SHA for each vendored repo in `MANIFEST.md` against the upstream's current `HEAD`. The check itself is the cadence — most months produce no refresh.
- **Bump only on meaningful change.** A refresh (SHA bump + recipe rerun) happens only when the upstream has changed in a way worth pulling. Examples that qualify: a new skill or asset added, an existing skill renamed or removed, a license change, or a change in hooks behavior. Examples that do not qualify: cosmetic README edits, formatting-only commits, or test-only changes that don't affect the surface we care about.
- **`OUR_NOTES.md` follows surface, not SHA.** On a refresh, only edit `OUR_NOTES.md` if the upstream's surface actually shifted (skill added, renamed, removed, or a scope decision that needs revisiting). A SHA bump alone is not a reason to touch it.
- **Ground truth:** the pinned SHA and snapshot date in `third-party/MANIFEST.md` are the source of truth for what is currently vendored. This README describes the policy; `MANIFEST.md` records the state.

## What is NOT here

- Build artifacts, `dist/`, `node_modules/`, `.git/`.
- Source code we have no intent to fork (the runtime/compiled side of upstreams).
- Translations of `README.md` other than English — kept lean intentionally.
