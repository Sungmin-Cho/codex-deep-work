#!/usr/bin/env bash
# migrated-by: codex-migrate v0.1
# --- begin codex-hook-stdin-parser (auto-injected) ---
STDIN_JSON=$(cat)
TOOL_NAME=$(printf '%s' "$STDIN_JSON" | jq -r '.tool_name // empty')
TOOL_INPUT=$(printf '%s' "$STDIN_JSON" | jq -c '.tool_input // {}')
HOOK_EVENT=$(printf '%s' "$STDIN_JSON" | jq -r '.hook_event_name // empty')
SESSION_ID=$(printf '%s' "$STDIN_JSON" | jq -r '.session_id // empty')
TURN_ID=$(printf '%s' "$STDIN_JSON" | jq -r '.turn_id // empty')
MODEL=$(printf '%s' "$STDIN_JSON" | jq -r '.model // empty')
export TOOL_NAME TOOL_INPUT HOOK_EVENT SESSION_ID TURN_ID MODEL
# Backward-compat env aliases — vendor extract-cc-hardcodes.sh 의 ENV_VARS 5종 모두.
export CLAUDE_TOOL_USE_TOOL_NAME="$TOOL_NAME"
export CLAUDE_TOOL_NAME="$TOOL_NAME"
export CLAUDE_TOOL_USE_TOOL_INPUT="$TOOL_INPUT"
export CLAUDE_TOOL_INPUT="$TOOL_INPUT"
export CLAUDE_TOOL_USE_INPUT="$TOOL_INPUT"
# --- end codex-hook-stdin-parser ---
# state-path migrated by codex-migrate v0.1
# update-check.sh — periodic version check for deep-work plugin (git-based)
#
# Output (one line, or nothing):
#   JUST_UPGRADED <old> <new>       — marker found from recent upgrade
#   UPGRADE_AVAILABLE <old> <new>   — remote VERSION differs from local
#   (nothing)                       — up to date, snoozed, disabled, or check skipped
#
# Modeled after gstack's update-check pattern.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
STATE_DIR="$HOME/.claude"
CACHE_FILE="$STATE_DIR/.deep-work-update-cache"
MARKER_FILE="$STATE_DIR/.deep-work-just-upgraded"
SNOOZE_FILE="$STATE_DIR/.deep-work-update-snoozed"
REMOTE_URL="https://raw.githubusercontent.com/Sungmin-Cho/codex-deep-work/main/plugins/deep-work/package.json"

# ─── Read local version from package.json ─────────────────────
LOCAL=""
if [ -f "$PLUGIN_DIR/package.json" ]; then
  LOCAL=$(node -e 'const p=process.argv[1]; console.log(JSON.parse(require("fs").readFileSync(p+"/package.json","utf8")).version)' "$PLUGIN_DIR" 2>/dev/null || true)
fi
if [ -z "$LOCAL" ]; then
  exit 0  # can't determine version
fi

# ─── Read profile for update settings ─────────────────────────
# Check deep-work-profile.yaml for auto_update and update_check settings
PROFILE_FILE=""
find_project_root() {
  local dir="$PWD"
  while [ "$dir" != "/" ]; do
    if [ -d "$dir/.codex" -o -d "$dir/.claude" ]; then echo "$dir"; return 0; fi
    dir="$(dirname "$dir")"
  done
  echo "$PWD"; return 1
}
PROJECT_ROOT="$(find_project_root 2>/dev/null || echo "$PWD")"

# /deep-review 2026-04-26 C1: read_state_file 호출 전에 utils.sh source 필수.
# 부록 F #8 commit 이 read_state_file 로 변경했으나 utils.sh 미source 라 함수 미정의 →
# `command not found` 가 `2>/dev/null || true` 로 silent 마스킹 → PROFILE_CONTENT 빈 값 →
# update_check / auto_update 사용자 opt-out 무시.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/utils.sh"

# Phase C 부록 F #8: indirect 변수 할당 → read_state_file 함수 호출. PROFILE_FILE 변수 제거,
# read_state_file 가 legacy .claude/ fallback + per-file resolution 자동 처리.
PROFILE_CONTENT="$(read_state_file deep-work-profile.yaml 2>/dev/null || true)"

# Check if updates are disabled
UPDATE_CHECK="true"
AUTO_UPDATE="false"
if [ -n "$PROFILE_CONTENT" ]; then
  _UC=$(printf '%s' "$PROFILE_CONTENT" | grep '^update_check:' 2>/dev/null | head -1 | sed 's/update_check:[[:space:]]*//' | tr -d '"'"'" || true)
  [ "$_UC" = "false" ] && UPDATE_CHECK="false"
  _AU=$(printf '%s' "$PROFILE_CONTENT" | grep '^auto_update:' 2>/dev/null | head -1 | sed 's/auto_update:[[:space:]]*//' | tr -d '"'"'" || true)
  [ "$_AU" = "true" ] && AUTO_UPDATE="true"
fi

if [ "$UPDATE_CHECK" = "false" ]; then
  exit 0
fi

# ─── Step 1: Check for just-upgraded marker ───────────────────
if [ -f "$MARKER_FILE" ]; then
  OLD_VER=$(cat "$MARKER_FILE" 2>/dev/null || true)
  rm -f "$MARKER_FILE"
  echo "JUST_UPGRADED $OLD_VER $LOCAL"
  exit 0
fi

# ─── Step 2: Check snooze ────────────────────────────────────
check_snooze() {
  local target_ver="$1"
  if [ ! -f "$SNOOZE_FILE" ]; then return 1; fi
  local snoozed_ver snoozed_level snoozed_ts
  snoozed_ver=$(awk '{print $1}' "$SNOOZE_FILE")
  snoozed_level=$(awk '{print $2}' "$SNOOZE_FILE")
  snoozed_ts=$(awk '{print $3}' "$SNOOZE_FILE")
  # Different version = new release, reset snooze
  if [ "$snoozed_ver" != "$target_ver" ]; then return 1; fi
  # Check TTL: level 1=24h, level 2=48h, level 3+=168h (1 week)
  local now ttl elapsed
  now=$(date +%s)
  case "$snoozed_level" in
    1) ttl=86400 ;;
    2) ttl=172800 ;;
    *) ttl=604800 ;;
  esac
  elapsed=$((now - snoozed_ts))
  if [ "$elapsed" -lt "$ttl" ]; then return 0; fi  # still snoozed
  return 1  # snooze expired
}

# ─── Step 3: Check cache (5-minute TTL) ──────────────────────
CACHE_TTL=5  # minutes
if [ -f "$CACHE_FILE" ]; then
  CACHED=$(cat "$CACHE_FILE" 2>/dev/null || true)
  STALE=$(find "$CACHE_FILE" -mmin +$CACHE_TTL 2>/dev/null || true)
  if [ -z "$STALE" ] && [ "$CACHE_TTL" -gt 0 ]; then
    case "$CACHED" in
      UP_TO_DATE*)
        CACHED_VER=$(echo "$CACHED" | awk '{print $2}')
        if [ "$CACHED_VER" = "$LOCAL" ]; then exit 0; fi
        ;;
      UPGRADE_AVAILABLE*)
        CACHED_OLD=$(echo "$CACHED" | awk '{print $2}')
        if [ "$CACHED_OLD" = "$LOCAL" ]; then
          CACHED_NEW=$(echo "$CACHED" | awk '{print $3}')
          if check_snooze "$CACHED_NEW"; then exit 0; fi
          echo "$CACHED"
          exit 0
        fi
        ;;
    esac
  fi
fi

# ─── Step 4: Fetch remote version ────────────────────────────
REMOTE_JSON=""
REMOTE_JSON=$(curl -sf --max-time 5 "$REMOTE_URL" 2>/dev/null || true)

REMOTE=""
if [ -n "$REMOTE_JSON" ]; then
  REMOTE=$(echo "$REMOTE_JSON" | node -e "process.stdin.setEncoding('utf8');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).version)}catch(e){}})" 2>/dev/null || true)
fi

# Validate version format
if ! echo "$REMOTE" | grep -qE '^[0-9]+\.[0-9.]+$'; then
  echo "UP_TO_DATE $LOCAL" > "$CACHE_FILE"
  exit 0
fi

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "UP_TO_DATE $LOCAL" > "$CACHE_FILE"
  exit 0
fi

# Versions differ
echo "UPGRADE_AVAILABLE $LOCAL $REMOTE" > "$CACHE_FILE"
if check_snooze "$REMOTE"; then
  exit 0
fi

echo "UPGRADE_AVAILABLE $LOCAL $REMOTE"
