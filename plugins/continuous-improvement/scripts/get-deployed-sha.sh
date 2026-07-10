#!/usr/bin/env bash
# scripts/get-deployed-sha.sh
#
# Print the currently-deployed commit SHA for an auto-deploy provider, or
# print the CLI command shape (with `--show-command`) without executing it.
# Composability primitive that owns the per-provider CLI knowledge so skills
# can cite one path instead of restating the 5-provider extraction table.
#
# Usage:
#   bash scripts/get-deployed-sha.sh <provider>
#   bash scripts/get-deployed-sha.sh --show-command <provider>
#
# Providers: railway | cloudflare | vercel | netlify | fly
#
# Default mode: runs the provider CLI, pipes through jq, prints the SHA on
# stdout. Requires the CLI to be installed and authenticated; exits 3 with a
# clear error if the CLI is missing.
#
# --show-command mode: prints the command pipeline that would run, without
# executing it. Useful for skill citations, dry-runs, and tests that should
# not require live CLI auth.
#
# Exit codes:
#   0 — SHA printed (default mode) or command printed (--show-command mode)
#   2 — missing or unknown provider (usage error)
#   3 — required CLI not installed (default mode only)
#   non-zero — CLI failure (passed through)
#
# Cited by:
#   - skills/verification-loop.md Phase 8 (deploy-receipt handoff trigger)
#   - skills/deploy-receipt.md Route A (provider CLI extraction)

set -u

SHOW_COMMAND=false
PROVIDER=""

while [ $# -gt 0 ]; do
  case "$1" in
    --show-command)
      SHOW_COMMAND=true
      shift
      ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" >&2
      exit 0
      ;;
    *)
      if [ -z "$PROVIDER" ]; then
        PROVIDER="$1"
      else
        printf 'usage: get-deployed-sha.sh [--show-command] <provider>\n' >&2
        exit 2
      fi
      shift
      ;;
  esac
done

if [ -z "$PROVIDER" ]; then
  printf 'usage: get-deployed-sha.sh [--show-command] <provider>\n' >&2
  exit 2
fi

# Single source of truth for the per-provider command pipeline. Each value is
# the literal pipeline that would run; the jq filter extracts the SHA.
case "$PROVIDER" in
  railway)
    CMD='railway status --json | jq -r .deployments[0].meta.commitHash'
    CLI=railway
    ;;
  cloudflare)
    CMD='wrangler deployments list --json | jq -r .[0].metadata.deployment_trigger.metadata.commit_hash'
    CLI=wrangler
    ;;
  vercel)
    CMD='vercel inspect "$(vercel ls --json | jq -r .[0].url)" --json | jq -r .gitSource.sha'
    CLI=vercel
    ;;
  netlify)
    CMD='netlify api listSiteDeploys --data="{\"site_id\":\"$NETLIFY_SITE_ID\"}" | jq -r .[0].commit_ref'
    CLI=netlify
    ;;
  fly)
    CMD='fly releases --json | jq -r .[0].commit_sha'
    CLI=fly
    ;;
  *)
    printf 'unknown or unsupported provider: %s\n' "$PROVIDER" >&2
    printf 'supported: railway | cloudflare | vercel | netlify | fly\n' >&2
    exit 2
    ;;
esac

if [ "$SHOW_COMMAND" = "true" ]; then
  printf '%s\n' "$CMD"
  exit 0
fi

if ! command -v "$CLI" >/dev/null 2>&1; then
  printf 'required CLI "%s" not installed for provider "%s"\n' "$CLI" "$PROVIDER" >&2
  exit 3
fi

if ! command -v jq >/dev/null 2>&1; then
  printf 'required CLI "jq" not installed\n' >&2
  exit 3
fi

# Execute the pipeline. eval is intentional — the per-provider CMD contains
# pipes and command substitution that need shell interpretation. CMDs are
# sourced from the literal table above, not user input.
eval "$CMD"
