#!/usr/bin/env bash
#
# pre-commit hook: block staging of paths that were already cleaned up
# from the repo (and added to .gitignore) but could leak back in via
# `git add -f` or accidental staging. Belt-and-suspenders alongside
# .gitignore — .gitignore is silent if you bypass it; this hook is loud.
#
# Install:
#   ln -s "$(pwd)/bin/pre-commit-block-strays.sh" .git/hooks/pre-commit
#   # or, if you already have a pre-commit hook, source this from it.
#
# Exit codes:
#   0 — no blocked paths in the staged diff
#   1 — at least one blocked path is staged; commit is aborted

set -u

# Paths that have ever historically leaked into the repo and are now ignored.
# Add an entry here when a new transient/output directory is removed.
BLOCKED_PATTERNS=(
  '^\.tmp-stop-e2e/'
  '^nanobanana-output/'
)

staged_paths="$(git diff --cached --name-only --diff-filter=AM)"
if [ -z "$staged_paths" ]; then
  exit 0
fi

violations=""
while IFS= read -r path; do
  for pattern in "${BLOCKED_PATTERNS[@]}"; do
    if printf '%s\n' "$path" | grep -qE "$pattern"; then
      violations="${violations}  - $path  (matches /$pattern/)"$'\n'
    fi
  done
done <<< "$staged_paths"

if [ -n "$violations" ]; then
  printf 'pre-commit: refusing to commit paths under historically-removed directories.\n\n'
  printf '%s\n' "$violations"
  printf 'These paths are .gitignore-blocked and have been removed from the repo;\n'
  printf 'they should not re-enter via the staging area. If you really need to commit\n'
  printf 'one of them, edit bin/pre-commit-block-strays.sh first to remove the pattern,\n'
  printf 'document the reason, and commit that change as its own PR.\n'
  exit 1
fi

exit 0
