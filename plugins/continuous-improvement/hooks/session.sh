#!/usr/bin/env bash
# session.sh — SessionStart/SessionEnd hook for continuous-improvement
# SessionStart: loads instincts and prints status
# SessionEnd: prompts reflection
# Always exits 0 — never blocks the session
trap 'exit 0' EXIT ERR INT TERM

INSTINCTS_DIR="${HOME}/.claude/instincts"

# Read stdin
INPUT="$(cat)"
[[ -z "$INPUT" ]] && exit 0

# ---------------------------------------------------------------------------
# Detect event type from hook context
# ---------------------------------------------------------------------------
# SessionStart hooks receive no tool_name, SessionEnd hooks may vary.
# We detect based on the hook_type field or the calling context.
EVENT_TYPE=""
if command -v jq &>/dev/null; then
  EVENT_TYPE="$(printf '%s' "$INPUT" | jq -r '.hook_type // .event_type // "unknown"' 2>/dev/null)"
else
  if printf '%s' "$INPUT" | grep -q '"SessionStart"'; then
    EVENT_TYPE="SessionStart"
  elif printf '%s' "$INPUT" | grep -q '"SessionEnd"'; then
    EVENT_TYPE="SessionEnd"
  fi
fi

# ---------------------------------------------------------------------------
# Project detection (same as observe.sh)
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
PROJECT_DIR="${INSTINCTS_DIR}/${PROJECT_HASH}"

# ---------------------------------------------------------------------------
# SessionStart: count observations and instincts, print brief status
# ---------------------------------------------------------------------------
if [[ "$EVENT_TYPE" == "SessionStart" || "$EVENT_TYPE" == "unknown" ]]; then
  OBS_COUNT=0
  INSTINCT_COUNT=0

  OBS_FILE="${PROJECT_DIR}/observations.jsonl"
  if [[ -f "$OBS_FILE" ]]; then
    OBS_COUNT="$(wc -l < "$OBS_FILE" 2>/dev/null || echo 0)"
  fi

  # Count yaml files in project + global
  for dir in "$PROJECT_DIR" "${INSTINCTS_DIR}/global"; do
    if [[ -d "$dir" ]]; then
      count="$(find "$dir" -maxdepth 1 -name '*.yaml' 2>/dev/null | wc -l)"
      INSTINCT_COUNT=$((INSTINCT_COUNT + count))
    fi
  done

  # Determine level
  LEVEL="CAPTURE"
  if (( OBS_COUNT >= 20 )) || (( INSTINCT_COUNT > 0 )); then
    LEVEL="ANALYZE"
  fi

  # Check for high-confidence instincts
  if (( INSTINCT_COUNT > 0 )); then
    for dir in "$PROJECT_DIR" "${INSTINCTS_DIR}/global"; do
      if [[ -d "$dir" ]]; then
        for f in "$dir"/*.yaml; do
          [[ -f "$f" ]] || continue
          conf="$(grep '^confidence:' "$f" 2>/dev/null | head -1 | sed 's/confidence: *//')"
          if [[ -n "$conf" ]]; then
            # Compare as integer (multiply by 100) using awk for portability
            int_conf="$(printf '%s' "$conf" | awk '{printf "%.0f", $1 * 100}')"
            if [[ -n "$int_conf" ]] && (( int_conf >= 70 )); then
              LEVEL="AUTO-APPLY"
              break 2
            elif (( int_conf >= 50 )); then
              LEVEL="SUGGEST"
            fi
          fi
        done
      fi
    done
  fi

  # Write status to stderr (visible in hook output, not blocking)
  echo "[continuous-improvement] Level: ${LEVEL} | Observations: ${OBS_COUNT} | Instincts: ${INSTINCT_COUNT}" >&2
fi

# ---------------------------------------------------------------------------
# SessionEnd: remind to reflect
# ---------------------------------------------------------------------------
if [[ "$EVENT_TYPE" == "SessionEnd" ]]; then
  echo "[continuous-improvement] Session ending. Run /continuous-improvement to reflect and capture learnings." >&2
fi

exit 0
