#!/usr/bin/env bash
# analyze.sh — Read observations.jsonl, detect patterns, create instinct YAML files
# Runs via /continuous-improvement command. Uses claude CLI with Haiku for cost-efficient analysis.

set -euo pipefail

INSTINCTS_DIR="${HOME}/.claude/instincts"

# ---------------------------------------------------------------------------
# Detect project
# ---------------------------------------------------------------------------
PROJECT_ROOT=""
if [[ -n "${CLAUDE_PROJECT_DIR:-}" && -d "${CLAUDE_PROJECT_DIR}" ]]; then
  PROJECT_ROOT="${CLAUDE_PROJECT_DIR}"
fi
if [[ -z "$PROJECT_ROOT" ]]; then
  PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
fi
if [[ -z "$PROJECT_ROOT" ]]; then
  PROJECT_ROOT="global"
fi

PROJECT_HASH="$(printf '%s' "$PROJECT_ROOT" | sha256sum | cut -c1-12)"
PROJECT_NAME="$(basename "${PROJECT_ROOT%.git}")"
PROJECT_DIR="${INSTINCTS_DIR}/${PROJECT_HASH}"
OBS_FILE="${PROJECT_DIR}/observations.jsonl"

# ---------------------------------------------------------------------------
# Check observations exist
# ---------------------------------------------------------------------------
if [[ ! -f "$OBS_FILE" ]] || [[ ! -s "$OBS_FILE" ]]; then
  echo "No observations found at ${OBS_FILE}"
  echo "Use Claude Code with hooks installed to generate observations."
  exit 0
fi

OBS_COUNT=$(wc -l < "$OBS_FILE")
echo "Found ${OBS_COUNT} observations in ${OBS_FILE}"

if (( OBS_COUNT < 20 )); then
  echo "Need at least 20 observations for meaningful analysis. Keep using Claude Code (${OBS_COUNT}/20)."
  exit 0
fi

# ---------------------------------------------------------------------------
# Read existing instincts to avoid duplicates
# ---------------------------------------------------------------------------
EXISTING_INSTINCTS=""
for f in "${PROJECT_DIR}"/*.yaml "${INSTINCTS_DIR}/global"/*.yaml; do
  [[ -f "$f" ]] && EXISTING_INSTINCTS="${EXISTING_INSTINCTS}$(cat "$f")"$'\n'
done

# ---------------------------------------------------------------------------
# Take last 500 observations
# ---------------------------------------------------------------------------
RECENT_OBS=$(tail -500 "$OBS_FILE")

# ---------------------------------------------------------------------------
# Build analysis prompt
# ---------------------------------------------------------------------------
ANALYSIS_PROMPT="Analyze these Claude Code session observations and extract behavioral patterns as instinct YAML files.

OBSERVATIONS (JSONL — each line is a tool call):
${RECENT_OBS}

EXISTING INSTINCTS (already learned — do NOT duplicate these):
${EXISTING_INSTINCTS}

YOUR TASK:
1. Look for REPEATED PATTERNS — same tool sequence used 3+ times
2. Look for ERROR-THEN-FIX sequences — tool fails, next tools fix it
3. Look for TOOL PREFERENCES — one tool consistently chosen over alternatives
4. Look for WORKFLOW PATTERNS — consistent ordering of operations
5. Look for USER CORRECTIONS — user says no/stop/don't after an action

OUTPUT FORMAT — output ONLY new instincts as YAML blocks, separated by ---:

id: descriptive-kebab-case-id
trigger: \"when [specific situation]\"
confidence: 0.5
domain: workflow|tooling|testing|patterns
source: observation
scope: project
project_id: ${PROJECT_HASH}
created: \"$(date -u +%Y-%m-%d)\"
last_seen: \"$(date -u +%Y-%m-%d)\"
observation_count: [number of times pattern was seen]
---
[One sentence describing the specific actionable behavior]

Rules:
- Only create instincts for patterns seen 3+ times
- Start confidence at 0.5 (suggest level)
- Be specific and actionable (not vague advice)
- Different from existing instincts listed above

If no new patterns are found, output exactly: NO_NEW_PATTERNS

Output ONLY the YAML blocks or NO_NEW_PATTERNS. No explanation, no preamble."

# ---------------------------------------------------------------------------
# Run analysis with Haiku
# ---------------------------------------------------------------------------
echo "Analyzing patterns with Haiku..."
RESULT=$(echo "$ANALYSIS_PROMPT" | claude --model haiku --print -p - 2>/dev/null) || {
  echo "Analysis failed — claude CLI error. Try running manually."
  exit 1
}

if [[ "$RESULT" == "NO_NEW_PATTERNS" ]] || [[ -z "$RESULT" ]]; then
  echo "No new patterns detected yet. Keep using Claude Code — patterns emerge over time."
  exit 0
fi

# ---------------------------------------------------------------------------
# Write instinct YAML files
# ---------------------------------------------------------------------------
mkdir -p "$PROJECT_DIR"

NEW_COUNT=0
INSTINCT_ID=""
BLOCK=""

while IFS= read -r line; do
  if [[ "$line" == "---" ]] && [[ -n "$BLOCK" ]]; then
    if [[ -n "$INSTINCT_ID" ]]; then
      DEST="${PROJECT_DIR}/${INSTINCT_ID}.yaml"
      printf '%s\n' "$BLOCK" > "$DEST"
      echo "  + ${INSTINCT_ID} -> ${DEST}"
      NEW_COUNT=$((NEW_COUNT + 1))
    fi
    INSTINCT_ID=""
    BLOCK=""
  else
    BLOCK="${BLOCK}${line}"$'\n'
    if [[ "$line" =~ ^id:\ (.+) ]]; then
      INSTINCT_ID="${BASH_REMATCH[1]}"
      INSTINCT_ID="${INSTINCT_ID//\"/}"
      INSTINCT_ID="${INSTINCT_ID//\'/}"
    fi
  fi
done <<< "$RESULT"

# Handle last block
if [[ -n "$INSTINCT_ID" ]] && [[ -n "$BLOCK" ]]; then
  DEST="${PROJECT_DIR}/${INSTINCT_ID}.yaml"
  printf '%s\n' "$BLOCK" > "$DEST"
  echo "  + ${INSTINCT_ID} -> ${DEST}"
  NEW_COUNT=$((NEW_COUNT + 1))
fi

echo ""
echo "Created ${NEW_COUNT} new instinct(s) in ${PROJECT_DIR}/"
