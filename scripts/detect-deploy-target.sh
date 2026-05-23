#!/usr/bin/env bash
# scripts/detect-deploy-target.sh
#
# Detect the auto-deploy provider for the repo rooted at the current working
# directory (or the first argument, if supplied). Composability primitive used
# by skills and hooks that need to know "does this repo auto-deploy, and if so
# from where?" without each restating the file-marker table.
#
# Output: one of
#   railway | cloudflare | vercel | netlify | fly | appengine | apprunner |
#   gha-deploy | none
#
# Resolution priority (first match wins):
#   1. railway.toml | railway.json                              → railway
#   2. wrangler.toml | wrangler.jsonc                           → cloudflare
#   3. vercel.json | .vercel/                                   → vercel
#   4. netlify.toml                                             → netlify
#   5. fly.toml                                                 → fly
#   6. app.yaml                                                 → appengine
#   7. apprunner.yaml                                           → apprunner
#   8. .github/workflows/*.{yml,yaml} containing "deploy:" job  → gha-deploy
#   9. nothing matched                                          → none
#
# Always exits 0. `none` is a valid result, not an error condition.
#
# Cited by:
#   - skills/verification-loop.md Phase 8 (deploy-receipt handoff trigger)
#   - skills/deploy-receipt.md "When to Activate" gate

set -u

ROOT="${1:-$PWD}"

emit() {
  printf '%s\n' "$1"
  exit 0
}

# Order is the contract — earlier rows shadow later ones when multiple
# markers exist in the same repo.
[ -f "$ROOT/railway.toml" ]    && emit railway
[ -f "$ROOT/railway.json" ]    && emit railway
[ -f "$ROOT/wrangler.toml" ]   && emit cloudflare
[ -f "$ROOT/wrangler.jsonc" ]  && emit cloudflare
[ -f "$ROOT/vercel.json" ]     && emit vercel
[ -d "$ROOT/.vercel" ]         && emit vercel
[ -f "$ROOT/netlify.toml" ]    && emit netlify
[ -f "$ROOT/fly.toml" ]        && emit fly
[ -f "$ROOT/app.yaml" ]        && emit appengine
[ -f "$ROOT/apprunner.yaml" ]  && emit apprunner

# GitHub Actions deploy workflow: scan .github/workflows/*.{yml,yaml} for a
# job whose key is literally `deploy:`. Cheap and conservative — false
# positives (a non-deploy job named "deploy") are unlikely; false negatives
# (a deploy job named something else) require the repo to declare the
# provider via one of the file markers above instead.
if [ -d "$ROOT/.github/workflows" ]; then
  if grep -lE '^[[:space:]]*deploy:[[:space:]]*$' \
        "$ROOT/.github/workflows/"*.yml \
        "$ROOT/.github/workflows/"*.yaml 2>/dev/null \
      | head -n 1 | grep -q .; then
    emit gha-deploy
  fi
fi

emit none
