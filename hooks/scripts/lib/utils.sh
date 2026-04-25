#!/usr/bin/env bash
# hooks/scripts/lib/utils.sh — function-based state API + stdin parser per spec Section 3-2.
# <!-- migrated-by: codex-migrate v0.1 -->
# .claude/ legacy fallback: read-only per-file import on first read.

set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

# read_state_file <relative-path>  — outputs file content. legacy import on first read.
read_state_file() {
  local rel_path="$1"
  local codex_path="$PROJECT_ROOT/.codex/$rel_path"
  local claude_path="$PROJECT_ROOT/.claude/$rel_path"

  if [[ -f "$codex_path" ]]; then
    cat "$codex_path"
    return 0
  fi

  if [[ -f "$claude_path" ]]; then
    if validate_legacy_schema "$claude_path"; then
      mkdir -p "$(dirname "$codex_path")"
      cp -p "$claude_path" "$codex_path"
      cat "$codex_path"
      return 0
    else
      echo "Legacy file $claude_path failed schema validation, skipping import" >&2
      return 1
    fi
  fi

  return 1
}

# write_state_file <relative-path> <content>  — always writes to .codex/, never .claude/.
write_state_file() {
  local rel_path="$1"
  local content="$2"
  local target="$PROJECT_ROOT/.codex/$rel_path"
  mkdir -p "$(dirname "$target")"
  printf '%s' "$content" > "$target"
}

# Plan-Patch-31 (deep-review v6 4차 C3): write_state_file_append — append 의도 보존.
write_state_file_append() {
  local rel_path="$1"
  local content="$2"
  local target="$PROJECT_ROOT/.codex/$rel_path"
  mkdir -p "$(dirname "$target")"
  printf '%s
' "$content" >> "$target"
}

# validate_legacy_schema <file>  — returns 0 if file is a valid CC v6.4.0 envelope.
validate_legacy_schema() {
  local file="$1"
  case "$file" in
    *.json) jq -e '.session_id and .phase' "$file" >/dev/null 2>&1 ;;
    *.md)   head -10 "$file" | grep -qE 'session_id|phase|SESSION' ;;
    *)      head -1 "$file" | grep -qE '^---|session_id' ;;
  esac
}

# parse_hook_stdin  — sources STDIN_JSON + 5 legacy aliases. Plan-Patch-7/8.
# Usage in hook scripts:  source "$(dirname "$0")/lib/utils.sh" && parse_hook_stdin
parse_hook_stdin() {
  STDIN_JSON=$(cat)
  TOOL_NAME=$(printf '%s' "$STDIN_JSON" | jq -r '.tool_name // empty')
  TOOL_INPUT=$(printf '%s' "$STDIN_JSON" | jq -c '.tool_input // {}')
  HOOK_EVENT=$(printf '%s' "$STDIN_JSON" | jq -r '.hook_event_name // empty')
  SESSION_ID=$(printf '%s' "$STDIN_JSON" | jq -r '.session_id // empty')
  TURN_ID=$(printf '%s' "$STDIN_JSON" | jq -r '.turn_id // empty')
  MODEL=$(printf '%s' "$STDIN_JSON" | jq -r '.model // empty')
  export TOOL_NAME TOOL_INPUT HOOK_EVENT SESSION_ID TURN_ID MODEL
  export CLAUDE_TOOL_USE_TOOL_NAME="$TOOL_NAME"
  export CLAUDE_TOOL_NAME="$TOOL_NAME"
  export CLAUDE_TOOL_USE_TOOL_INPUT="$TOOL_INPUT"
  export CLAUDE_TOOL_INPUT="$TOOL_INPUT"
  export CLAUDE_TOOL_USE_INPUT="$TOOL_INPUT"
}
