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

### Driver

`bin/refresh-third-party.mjs` automates step 2 in code (Node ESM, no
dependencies, cross-platform). `MANIFEST.md` remains the source of truth
for the selective scope and pinned SHAs. Common invocations:

```
node bin/refresh-third-party.mjs --help
node bin/refresh-third-party.mjs --list
node bin/refresh-third-party.mjs <name> --check
node bin/refresh-third-party.mjs <name>
node bin/refresh-third-party.mjs --all --check
```

The driver refuses to overwrite a snapshot path that has uncommitted
changes unless `--force` is passed, and aborts the refresh if upstream
HEAD does not match the pinned SHA in `MANIFEST.md` (bump the SHA
first).

## What is NOT here

- Build artifacts, `dist/`, `node_modules/`, `.git/`.
- Source code we have no intent to fork (the runtime/compiled side of upstreams).
- Translations of `README.md` other than English — kept lean intentionally.
