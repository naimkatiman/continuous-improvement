#!/usr/bin/env bash
# observe.sh — Mulahazah PreToolUse/PostToolUse observation hook
# Captures every tool call as a JSONL line. Must complete in <50ms. Always exits 0.
# Usage: echo '<hook_json>' | observe.sh

# Always exit 0 — never block the Claude session
trap 'exit 0' EXIT ERR INT TERM

INSTINCTS_DIR="${HOME}/.claude/instincts"

# ---------------------------------------------------------------------------
# Read stdin (hook payload) — single read for performance
# ---------------------------------------------------------------------------
INPUT="$(cat)"
[[ -z "$INPUT" ]] && exit 0

# ---------------------------------------------------------------------------
# Parse hook payload — use jq if available, otherwise basic extraction
# ---------------------------------------------------------------------------
if command -v jq &>/dev/null; then
  read -r TOOL_NAME SESSION_ID HAS_OUTPUT INPUT_JSON OUTPUT_JSON <<< "$(
    printf '%s' "$INPUT" | jq -r '
      (.tool_name // ""),
      (.session_id // ""),
      (if has("tool_output") then "yes" else "no" end),
      ((.tool_input // {} | tostring) | .[0:500]),
      ((.tool_output // {} | tostring) | .[0:200])
    ' | paste - - - - -
  )"
else
  # Fallback: extract tool_name with basic pattern matching
  TOOL_NAME="$(printf '%s' "$INPUT" | sed -n 's/.*"tool_name" *: *"\([^"]*\)".*/\1/p' | head -1)"
  SESSION_ID="$(printf '%s' "$INPUT" | sed -n 's/.*"session_id" *: *"\([^"]*\)".*/\1/p' | head -1)"
  HAS_OUTPUT="no"
  printf '%s' "$INPUT" | grep -q '"tool_output"' && HAS_OUTPUT="yes"
  INPUT_JSON="$(printf '%s' "$INPUT" | head -c 500)"
  OUTPUT_JSON=""
fi

[[ -z "$TOOL_NAME" ]] && exit 0

# Determine event type
if [[ "$HAS_OUTPUT" == "yes" ]]; then
  EVENT="tool_complete"
else
  EVENT="tool_start"
fi

# ---------------------------------------------------------------------------
# Project detection
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

# ---------------------------------------------------------------------------
# Compute project hash and name
# ---------------------------------------------------------------------------
PROJECT_HASH="$(printf '%s' "$PROJECT_ROOT" | sha256sum | cut -c1-12)"
PROJECT_NAME="$(basename "${PROJECT_ROOT%.git}")"

# ---------------------------------------------------------------------------
# Directory setup
# ---------------------------------------------------------------------------
PROJECT_DIR="${INSTINCTS_DIR}/${PROJECT_HASH}"
OBS_FILE="${PROJECT_DIR}/observations.jsonl"

[[ -d "$PROJECT_DIR" ]] || mkdir -p "$PROJECT_DIR"

# ---------------------------------------------------------------------------
# Rotate observations.jsonl at 10,000 lines
# ---------------------------------------------------------------------------
if [[ -f "$OBS_FILE" ]]; then
  LINE_COUNT="$(wc -l < "$OBS_FILE")"
  if (( LINE_COUNT >= 10000 )); then
    mv "$OBS_FILE" "${PROJECT_DIR}/observations.$(date -u +"%Y-%m-%d-%H%M%S").jsonl"
    
    # Clean up old archives - keep only 10 most recent
    ls -t "${PROJECT_DIR}"/observations.*.jsonl 2>/dev/null | tail -n +11 | xargs -r rm -f
  fi
fi

# ---------------------------------------------------------------------------
# Append JSONL observation line
# ---------------------------------------------------------------------------
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

if command -v jq &>/dev/null; then
  printf '%s\n' "$(jq -cn \
    --arg ts "$TS" \
    --arg event "$EVENT" \
    --arg session "$SESSION_ID" \
    --arg tool "$TOOL_NAME" \
    --arg input_summary "$INPUT_JSON" \
    --arg output_summary "$OUTPUT_JSON" \
    --arg project_id "$PROJECT_HASH" \
    --arg project_name "$PROJECT_NAME" \
    '{ts:$ts,event:$event,session:$session,tool:$tool,input_summary:$input_summary,output_summary:$output_summary,project_id:$project_id,project_name:$project_name}')" \
    >> "$OBS_FILE"
else
  # Fallback: manual JSON construction
  printf '{"ts":"%s","event":"%s","session":"%s","tool":"%s","project_id":"%s","project_name":"%s"}\n' \
    "$TS" "$EVENT" "$SESSION_ID" "$TOOL_NAME" "$PROJECT_HASH" "$PROJECT_NAME" \
    >> "$OBS_FILE"
fi

# ---------------------------------------------------------------------------
# Write project.json if new project
# ---------------------------------------------------------------------------
PROJECT_JSON="${PROJECT_DIR}/project.json"
if [[ ! -f "$PROJECT_JSON" ]]; then
  if command -v jq &>/dev/null; then
    jq -n \
      --arg id "$PROJECT_HASH" \
      --arg name "$PROJECT_NAME" \
      --arg root "$PROJECT_ROOT" \
      --arg created_at "$TS" \
      '{id:$id,name:$name,root:$root,created_at:$created_at}' \
      > "$PROJECT_JSON"
  else
    printf '{"id":"%s","name":"%s","root":"%s","created_at":"%s"}\n' \
      "$PROJECT_HASH" "$PROJECT_NAME" "$PROJECT_ROOT" "$TS" \
      > "$PROJECT_JSON"
  fi
fi

exit 0
