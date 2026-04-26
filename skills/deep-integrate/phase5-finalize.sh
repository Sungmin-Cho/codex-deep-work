#!/usr/bin/env bash
# phase5-finalize.sh — Phase 5 state file writes through a constrained helper.
#
# Phase 5 only needs to record `phase5_completed_at`; it must not rewrite the
# whole state file or mutate unrelated frontmatter such as `work_dir`.
#
# Usage: phase5-finalize.sh <state-file> [<phase5_completed_at-iso8601>]

set -u

STATE_FILE="${1:-}"
ISO_TS="${2:-}"

err() { printf '[phase5-finalize] %s\n' "$*" >&2; }

if [[ -z "$STATE_FILE" ]]; then
  err "usage: phase5-finalize.sh <state-file> [<phase5_completed_at-iso8601>]"
  exit 1
fi

if [[ -z "$ISO_TS" ]]; then
  ISO_TS="$(date -u +%FT%TZ)"
fi

if [[ ! -f "$STATE_FILE" ]]; then
  err "state file not found: $STATE_FILE"
  exit 1
fi

# Guard against arbitrary file writes. The helper may update only the active
# Codex deep-work session file:
#   <project-root>/.codex/deep-work.<session-id>.md
_expected_sid="${DEEP_WORK_SESSION_ID:-}"
if [[ -z "$_expected_sid" ]]; then
  _state_dir="$(cd "$(dirname "$STATE_FILE")" 2>/dev/null && pwd || true)"
  if [[ -n "$_state_dir" ]]; then
    _project_root="$(dirname "$_state_dir")"
    _ptr="$_project_root/.codex/deep-work-current-session"
    [[ -f "$_ptr" ]] && _expected_sid="$(tr -d '\n\r' < "$_ptr" 2>/dev/null || true)"
  fi
fi

_state_basename="$(basename "$STATE_FILE")"
if ! [[ "$_state_basename" =~ ^deep-work\.[A-Za-z0-9_-]+\.md$ ]]; then
  err "refusing: state file basename '$_state_basename' does not match 'deep-work.<sid>.md' pattern"
  exit 1
fi

_state_parent_dir="$(basename "$(dirname "$STATE_FILE")")"
if [[ "$_state_parent_dir" != ".codex" ]]; then
  err "refusing: state file not in .codex/ directory (got parent: $_state_parent_dir)"
  exit 1
fi

if [[ -n "$_expected_sid" && "$_state_basename" != "deep-work.$_expected_sid.md" ]]; then
  err "refusing: state file '$_state_basename' does not match current session '$_expected_sid'"
  exit 1
fi

if ! [[ "$ISO_TS" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$ ]]; then
  err "invalid ISO 8601 timestamp: $ISO_TS"
  exit 1
fi

tmp="$(mktemp)" || { err "mktemp failed"; exit 2; }
trap 'rm -f "$tmp"' EXIT

awk -v ts="$ISO_TS" '
  BEGIN { in_fm=0; fm_end=0; added=0 }
  /^---[[:space:]]*$/ {
    if (in_fm == 0 && fm_end == 0) { in_fm=1; print; next }
    if (in_fm == 1) {
      if (!added) { printf "phase5_completed_at: \"%s\"\n", ts; added=1 }
      in_fm=0; fm_end=1; print; next
    }
  }
  {
    if (in_fm && /^phase5_completed_at:/) {
      printf "phase5_completed_at: \"%s\"\n", ts
      added=1
      next
    }
    print
  }
' "$STATE_FILE" > "$tmp" || { err "awk processing failed"; exit 2; }

if ! [[ -s "$tmp" ]]; then
  err "produced empty output — refusing to overwrite state file"
  exit 2
fi

if ! grep -qE '^phase5_completed_at:' "$tmp"; then
  err "refusing: phase5_completed_at was not written (no frontmatter detected?)"
  exit 2
fi

mv "$tmp" "$STATE_FILE" || { err "mv failed"; exit 2; }
trap - EXIT

err "phase5_completed_at recorded: $ISO_TS"
exit 0
