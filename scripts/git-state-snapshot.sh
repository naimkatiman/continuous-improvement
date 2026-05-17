#!/usr/bin/env bash
# scripts/git-state-snapshot.sh
#
# Emit a single-line JSON envelope describing the current git working-tree
# state. Composability primitive used by skills that need to baseline or check
# git state without each restating the same 3-command triple.
#
# Fields:
#   - head:     short SHA returned by `git rev-parse --short HEAD`
#   - upstream: short SHA of `@{u}` if the branch tracks an upstream, else "none"
#   - dirty:    integer count of lines from `git status --porcelain` (0 == clean)
#   - root:     absolute path from `git rev-parse --show-toplevel`
#   - branch:   `git symbolic-ref --short HEAD`, else "detached"
#
# Outside a git repository the script prints `{"error":"not-a-git-repo"}` and
# exits 1. All other failures are treated as a non-git-repo condition rather
# than emitting a partial envelope.
#
# Cited by:
#   - skills/gateguard.md            (Parallel-Actor Gate baseline + divergence)
#   - skills/worktree-safety.md      (Root + branch alignment)
#   - skills/workspace-surface-audit.md (Environment Grain — parallel-actor row)

set -u

head=$(git rev-parse --short HEAD 2>/dev/null) || {
  printf '{"error":"not-a-git-repo"}\n'
  exit 1
}

if upstream=$(git rev-parse --short '@{u}' 2>/dev/null); then
  upstream_field=$(printf '"%s"' "$upstream")
else
  upstream_field='"none"'
fi

dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

root=$(git rev-parse --show-toplevel 2>/dev/null || printf 'unknown')

if branch=$(git symbolic-ref --short HEAD 2>/dev/null); then
  branch_field=$(printf '"%s"' "$branch")
else
  branch_field='"detached"'
fi

printf '{"head":"%s","upstream":%s,"dirty":%s,"root":"%s","branch":%s}\n' \
  "$head" "$upstream_field" "$dirty" "$root" "$branch_field"
