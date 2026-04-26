#!/usr/bin/env bash
# phase5-record-error.sh — Phase 5 defensive error marker.
#
# If integrate-loop.json has `terminated_by: null`, replace it with "error".
# If the loop file does not exist yet, create the minimal loop-state shape.
#
# Usage: phase5-record-error.sh <work-dir-absolute>

set -u

err() { printf '[phase5-record-error] %s\n' "$*" >&2; }

if ! command -v jq >/dev/null 2>&1; then
  err "refusing: jq not found on PATH — Phase 5 helpers require jq"
  exit 1
fi

WORK_DIR="${1:-}"
if [[ -z "$WORK_DIR" ]]; then
  err "usage: phase5-record-error.sh <work-dir-absolute>"
  exit 1
fi

if [[ ! -d "$WORK_DIR" ]]; then
  err "work_dir does not exist: $WORK_DIR"
  exit 1
fi

case "$WORK_DIR" in
  /*) : ;;
  *) err "work_dir must be absolute path (got: $WORK_DIR)"; exit 1 ;;
esac

# Walk up to the project root by finding `.codex`. Legacy `.claude` state is
# read-only compatibility input elsewhere; this helper must validate against
# Codex runtime state only.
SESSION_ID="${DEEP_WORK_SESSION_ID:-}"
_pr=""
_cur="$WORK_DIR"
while [[ -n "$_cur" && "$_cur" != "/" ]]; do
  if [[ -d "$_cur/.codex" ]]; then
    _pr="$_cur"
    break
  fi
  _parent="$(dirname "$_cur")"
  [[ "$_parent" == "$_cur" ]] && break
  _cur="$_parent"
done
[[ -z "$_pr" ]] && _pr="$(dirname "$(dirname "$WORK_DIR")")"

if [[ -z "$SESSION_ID" ]]; then
  _ptr="$_pr/.codex/deep-work-current-session"
  [[ -f "$_ptr" ]] && SESSION_ID="$(tr -d '\n\r' < "$_ptr" 2>/dev/null || true)"
fi

if [[ -z "$SESSION_ID" ]]; then
  err "refusing: cannot resolve current session ID (no DEEP_WORK_SESSION_ID env, no pointer)"
  exit 1
fi

_state_file="$_pr/.codex/deep-work.${SESSION_ID}.md"
if [[ ! -f "$_state_file" ]]; then
  err "refusing: state file not found for session '$SESSION_ID' (expected $_state_file)"
  exit 1
fi

_snapshot_rel="$(awk '
  /^---[[:space:]]*$/ { in_fm=!in_fm; next }
  in_fm && /^phase5_work_dir_snapshot:/ {
    sub(/^phase5_work_dir_snapshot:[[:space:]]*/, "")
    gsub(/^"|"$|^'"'"'|'"'"'$/, "")
    print; exit
  }
' "$_state_file" 2>/dev/null || true)"

_resolved_wd_rel=""
if [[ -n "$_snapshot_rel" ]]; then
  _expected_abs="$_pr/$_snapshot_rel"
  _got_canon="$(cd "$WORK_DIR" 2>/dev/null && pwd -P || echo "$WORK_DIR")"
  _exp_canon="$(cd "$_expected_abs" 2>/dev/null && pwd -P || echo "$_expected_abs")"
  if [[ "$_got_canon" != "$_exp_canon" ]]; then
    err "refusing: work_dir argument ($WORK_DIR) does not match session snapshot ($_expected_abs)"
    exit 1
  fi
  _resolved_wd_rel="$_snapshot_rel"
else
  _wd_rel="$(awk '
    /^---[[:space:]]*$/ { in_fm=!in_fm; next }
    in_fm && /^work_dir:/ {
      sub(/^work_dir:[[:space:]]*/, "")
      gsub(/^"|"$|^'"'"'|'"'"'$/, "")
      print; exit
    }
  ' "$_state_file" 2>/dev/null || true)"
  if [[ -z "$_wd_rel" ]]; then
    err "refusing: state has neither phase5_work_dir_snapshot nor work_dir"
    exit 1
  fi
  _expected_abs="$_pr/$_wd_rel"
  _got_canon="$(cd "$WORK_DIR" 2>/dev/null && pwd -P || echo "$WORK_DIR")"
  _exp_canon="$(cd "$_expected_abs" 2>/dev/null && pwd -P || echo "$_expected_abs")"
  if [[ "$_got_canon" != "$_exp_canon" ]]; then
    err "refusing: work_dir ($WORK_DIR) does not match state work_dir ($_expected_abs) — no snapshot available"
    exit 1
  fi
  _resolved_wd_rel="$_wd_rel"
fi

LOOP_FILE="$WORK_DIR/integrate-loop.json"

if [[ -f "$LOOP_FILE" ]]; then
  tb="$(jq -r '.terminated_by // "null"' "$LOOP_FILE" 2>/dev/null || echo "null")"
  if [[ "$tb" == "null" ]]; then
    tmp="$(mktemp "${TMPDIR:-/tmp}/phase5-record-error.XXXXXX")" || { err "mktemp failed"; exit 2; }
    if jq '.terminated_by = "error"' "$LOOP_FILE" > "$tmp" 2>/dev/null; then
      mv "$tmp" "$LOOP_FILE" || { err "mv failed"; rm -f "$tmp"; exit 2; }
      err "recorded terminated_by=error in $LOOP_FILE"
    else
      rm -f "$tmp"
      err "jq modification failed — loop file preserved"
      exit 2
    fi
  else
    err "terminated_by already set ($tb) — no change"
  fi
else
  tmp="$(mktemp "${TMPDIR:-/tmp}/phase5-record-error.XXXXXX")" || { err "mktemp failed"; exit 2; }
  iso="$(date -u +%FT%TZ)"
  if jq -n --arg id "${SESSION_ID}" --arg ts "$iso" --arg wd "$_resolved_wd_rel" \
    '{session_id:$id, work_dir:$wd, entered_at:$ts, loop_round:0, max_rounds:5,
      executed:[], last_recommendations:null, terminated_by:"error"}' > "$tmp" 2>/dev/null; then
    mv "$tmp" "$LOOP_FILE" || { err "mv failed"; rm -f "$tmp"; exit 2; }
    err "created new $LOOP_FILE with terminated_by=error"
  else
    rm -f "$tmp"
    err "jq construction failed"
    exit 2
  fi
fi

exit 0
