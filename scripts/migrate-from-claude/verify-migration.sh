#!/usr/bin/env bash
# verify-migration.sh — allowlist-based regression gate per spec Section 4-3, 4-5.
# <!-- migrated-by: codex-migrate v0.1 -->

# Plan-Patch-18 (deep-review v3-round C8): -e 제거 — check 1 fail 시 조기 종료 차단.
set -uo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ALLOWLIST_DIR="$PROJECT_ROOT/scripts/migrate-from-claude/lib"

EXIT=0

echo "=== verify-migration: 1. test count + pass/fail ==="
BASELINE=$(cat "$PROJECT_ROOT/tests/.baseline-count" 2>/dev/null || echo "")
EXPECTED_FAIL=$(cat "$PROJECT_ROOT/tests/.expected-fail-count" 2>/dev/null || echo "0")
if [ -z "$BASELINE" ]; then
  echo "WARN: tests/.baseline-count missing"
else
  # /deep-review 2026-04-26 C5: count 만이 아니라 pass/fail 도 검증. 이전엔 count = count
  # 만 통과해도 ALL CHECKS PASS — 136 fails 가 silently masked.
  TEST_OUTPUT=$(cd "$PROJECT_ROOT" && node --test 2>&1)
  ACTUAL=$(printf '%s' "$TEST_OUTPUT" | { grep -E "^[ℹ#] tests [0-9]+" || true; } | { awk '{print $3}' || true; } | head -1)
  ACTUAL_PASS=$(printf '%s' "$TEST_OUTPUT" | { grep -E "^[ℹ#] pass [0-9]+" || true; } | { awk '{print $3}' || true; } | head -1)
  ACTUAL_FAIL=$(printf '%s' "$TEST_OUTPUT" | { grep -E "^[ℹ#] fail [0-9]+" || true; } | { awk '{print $3}' || true; } | head -1)
  ACTUAL="${ACTUAL:-}"
  ACTUAL_PASS="${ACTUAL_PASS:-0}"
  ACTUAL_FAIL="${ACTUAL_FAIL:-0}"
  echo "baseline=$BASELINE actual=${ACTUAL:-(none)} pass=$ACTUAL_PASS fail=$ACTUAL_FAIL expected_fail=$EXPECTED_FAIL"

  PHASE_GATE_T="${PHASE_GATE:-phase-b}"
  STRICT_MODE=0
  if [ "$PHASE_GATE_T" = "phase-d" ] || [ "${VERIFY_STRICT:-}" = "1" ]; then
    STRICT_MODE=1
  fi

  # Sub-check 1a: test count matches baseline
  if [ "$ACTUAL" != "$BASELINE" ]; then
    if [ "$STRICT_MODE" = "1" ]; then
      echo "FAIL: test count mismatch (expected $BASELINE, got ${ACTUAL:-empty}; strict mode)"
      EXIT=1
    else
      echo "WARN: test count mismatch (expected $BASELINE, got ${ACTUAL:-empty}; Phase B 정상)"
    fi
  fi

  # Sub-check 1b: actual fail count <= expected_fail (regression detection)
  if [ "$ACTUAL_FAIL" -gt "$EXPECTED_FAIL" ]; then
    if [ "$STRICT_MODE" = "1" ]; then
      echo "FAIL: test fail count exceeds expected (got $ACTUAL_FAIL, expected ≤ $EXPECTED_FAIL; strict mode)"
      EXIT=1
    else
      echo "WARN: test fail count exceeds expected (got $ACTUAL_FAIL, expected ≤ $EXPECTED_FAIL; Phase B 정상)"
    fi
  elif [ "$ACTUAL" = "$BASELINE" ] && [ "$ACTUAL_FAIL" -le "$EXPECTED_FAIL" ]; then
    echo "PASS: test count matches baseline AND fail count ≤ expected ($ACTUAL_FAIL ≤ $EXPECTED_FAIL)"
  fi
fi

# Plan-Patch-12 (deep-review C9): glob → regex 변환 함수 inline node 호출.
# Phase D 진입 검토 (2026-04-26): glob2regex 의 escape 버그 정정 — 이전 `\\\\.` 는
# bash 문자열 `\\.` 가 되고, grep -E 에서 literal `\` + any char 로 해석 (literal `.` 아님).
# 정확한 escape: JS source `\\.` → bash 문자열 `\.` → grep -E literal `.`.
glob2regex_node='
const allowed = JSON.parse(require("fs").readFileSync(process.argv[1])).allowed_paths;
const toRegex = g => g
  .replace(/\./g, "\\.")
  .replace(/\*\*/g, "___DOUBLESTAR___")
  .replace(/\*/g, "[^/]*")
  .replace(/___DOUBLESTAR___/g, ".*");
console.log(allowed.map(toRegex).join("|"));
'

echo "=== verify-migration: 2. .claude/ literal allowlist (C-A2 + C9 + Plan-Patch-28) ==="
ALLOW_PATHS=$(node -e "$glob2regex_node" "$ALLOWLIST_DIR/allowlist-claude-fallback.json" 2>/dev/null) || ALLOW_PATHS=""
if [ -z "$ALLOW_PATHS" ]; then
  echo "FAIL: allowlist-claude-fallback.json regex generation failed (empty result)"
  EXIT=1
else
  LEFTOVER=$(grep -rln "\.claude/" "$PROJECT_ROOT/commands" "$PROJECT_ROOT/skills" "$PROJECT_ROOT/agents" "$PROJECT_ROOT/sensors" "$PROJECT_ROOT/health" "$PROJECT_ROOT/templates" "$PROJECT_ROOT/hooks" 2>/dev/null \
    | grep -vE "($ALLOW_PATHS)" || true)
  if [ -n "$LEFTOVER" ]; then
    PHASE_GATE_C="${PHASE_GATE:-phase-b}"
    if [ "$PHASE_GATE_C" = "phase-d" ] || [ "${VERIFY_STRICT:-}" = "1" ]; then
      echo "FAIL: unexpected .claude/ literal (PHASE_GATE=$PHASE_GATE_C — strict mode):"
      echo "$LEFTOVER"
      EXIT=1
    else
      # Phase B: skill/command markdown 본문에 legacy fallback 설명이 잔존 가능 — Phase-C 사람 검토.
      echo "WARN: unexpected .claude/ literal in (PHASE_GATE=$PHASE_GATE_C — Phase B 정상):"
      echo "$LEFTOVER" | head -10
    fi
  else
    echo "PASS: .claude/ literals all allowlisted"
  fi
fi

echo "=== verify-migration: 3. B-α call-form leftover (W-R1 + C9 + Plan-Patch-28) ==="
ALLOW_BA=$(node -e "$glob2regex_node" "$ALLOWLIST_DIR/allowlist-b-alpha-tokens.json" 2>/dev/null) || ALLOW_BA=""
if [ -z "$ALLOW_BA" ]; then
  echo "FAIL: allowlist-b-alpha-tokens.json regex generation failed (empty result)"
  EXIT=1
else
  CALL_FORM=$(grep -rEn 'TaskCreate\(|TaskUpdate\(|TaskList\(|TaskGet\(|TodoWrite\(|TeamCreate\(|TeamDelete\(|TeamGet\(|SendMessage\(|Skill\(["'"'"']|AskUserQuestion\(' \
    "$PROJECT_ROOT/commands" "$PROJECT_ROOT/skills" "$PROJECT_ROOT/agents" "$PROJECT_ROOT/hooks" 2>/dev/null \
    | grep -vE "($ALLOW_BA)" || true)
  if [ -n "$CALL_FORM" ]; then
    echo "FAIL: B-α call-form leftover:"
    echo "$CALL_FORM" | head -10
    EXIT=1
  else
    echo "PASS: 0 B-α call-form leftover"
  fi
fi

echo "=== verify-migration: 4. state path raw access (C-PA1 + Plan-Patch-19, deep-review v3-round C6) ==="
# Plan-Patch-32c (Phase B 실행 발견): commands/skills/agents 는 markdown 문서 — illustrative
# 경로 (`$PROJECT_ROOT/.codex/deep-work-current-session` 같은 docs) 가 정상. 활성 filesystem
# access 가 가능한 functional 코드 (hooks/scripts/sensors/health/templates) 만 scan.
SCAN_DIRS=("$PROJECT_ROOT/sensors" "$PROJECT_ROOT/health" "$PROJECT_ROOT/templates" "$PROJECT_ROOT/hooks/scripts")
EXISTING_SCAN_DIRS=()
for d in "${SCAN_DIRS[@]}"; do
  [ -d "$d" ] && EXISTING_SCAN_DIRS+=("$d")
done
if [ ${#EXISTING_SCAN_DIRS[@]} -gt 0 ]; then
  # Plan-Patch-32 (deep-review v6 4차 C2): bash-glob 변환 라인의 `# state-glob-pattern (codex-migrate)` 마커를 grep -v 로 제외.
  # Phase B 실행 발견: test files (legacy 경로 시뮬레이션 fixture) + vendor 의 helper wrapper
  # (hooks/scripts/utils.sh) 도 grep -v 제외 — 둘 다 정상 raw 사용처.
  RAW=$(grep -rEn '\.codex/deep-work[/.\-]|\.claude/deep-work[/.\-]' "${EXISTING_SCAN_DIRS[@]}" 2>/dev/null \
    | grep -vE 'read_state_file|write_state_file|read_state_file_append|write_state_file_append|hooks/scripts/lib/utils\.sh|hooks/scripts/utils\.sh|hooks/scripts/notify\.sh|tests/fixtures/|state-glob-pattern|\.test\.(js|mjs)' \
    | grep -vE 'TODO\(Phase-C\)' \
    | grep -vE '^[^:]+:[0-9]+:\s*#|^[^:]+:[0-9]+:\s*//|^[^:]+:[0-9]+:\s*\*' || true)
  # Phase C 부록 F #8: 코멘트 라인 (`#` shell, `//` JS) + JSDoc `*` continuation 모두 제외 — 문서/주석 false positive 차단.
  if [ -n "$RAW" ]; then
    PHASE_GATE_RAW="${PHASE_GATE:-phase-b}"
    if [ "$PHASE_GATE_RAW" = "phase-d" ] || [ "${VERIFY_STRICT:-}" = "1" ]; then
      echo "FAIL: raw .codex/deep-work* or .claude/deep-work* access outside utils.sh (PHASE_GATE=$PHASE_GATE_RAW — strict mode):"
      echo "$RAW" | head -10
      EXIT=1
    else
      # Phase B: vendor 의 indirect 변수 할당 + JS string/comment docs 가 잔존 가능 — Phase-C 사람 검토.
      echo "WARN: raw .codex/deep-work* access outside function API (PHASE_GATE=$PHASE_GATE_RAW — Phase B 정상, Phase D 진입 시 strict 검증):"
      echo "$RAW" | head -10
    fi
  else
    echo "PASS: state path access via function API only"
  fi

  # Plan-Patch-26: PHASE_GATE 환경변수 + VERIFY_STRICT — Phase D 진입 시 Phase-C TODO 잔존 FAIL.
  PHASEC_TODOS=$(grep -rEn 'TODO\(Phase-C\)' "$PROJECT_ROOT/hooks/scripts" 2>/dev/null \
    | grep -v 'tests/fixtures/' || true)
  if [ -n "$PHASEC_TODOS" ]; then
    PHASE_GATE="${PHASE_GATE:-phase-b}"
    if [ "$PHASE_GATE" = "phase-d" ] || [ "${VERIFY_STRICT:-}" = "1" ]; then
      echo "FAIL: Phase-C TODO markers in hooks/scripts (PHASE_GATE=$PHASE_GATE — strict mode):"
      echo "$PHASEC_TODOS" | head -10
      EXIT=1
    else
      echo "WARN: Phase-C TODO markers in hooks/scripts (PHASE_GATE=$PHASE_GATE — Phase B 정상, Phase D 진입 시 PHASE_GATE=phase-d 또는 VERIFY_STRICT=1 로 재실행하여 fail 검증):"
      echo "$PHASEC_TODOS" | head -5
    fi
  fi
else
  echo "WARN: no scan directories present (partial migration?)"
fi

echo "=== verify-migration: 4.5 hooks/scripts/*.sh syntax (Plan-Patch-34, deep-review v6 5차 C1+C2) ==="
# Plan-Patch-34: vendor 변환된 hooks/scripts/*.sh 가 multi-line over-match 정규식으로 broken 됐던 결함의
# 회귀 차단. 모든 .sh 파일에 `bash -n` syntax check.
SH_SYNTAX_FAIL=()
for sh_file in "$PROJECT_ROOT/hooks/scripts"/*.sh; do
  [ -f "$sh_file" ] || continue
  if ! bash -n "$sh_file" 2>/dev/null; then
    SH_SYNTAX_FAIL+=("$sh_file")
  fi
done
if [ ${#SH_SYNTAX_FAIL[@]} -gt 0 ]; then
  echo "FAIL: hooks/scripts/*.sh syntax errors (Plan-Patch-34 root cause):"
  for f in "${SH_SYNTAX_FAIL[@]}"; do
    echo "  $f"
    bash -n "$f" 2>&1 | head -2 | sed 's/^/    /'
  done
  EXIT=1
else
  echo "PASS: all hooks/scripts/*.sh bash -n syntactically valid"
fi

echo "=== verify-migration: 5. hook stdin parser regression (C-A1 + Plan-Patch-20, deep-review v3-round C4) ==="
PARSER_OK=true
UTILS_SH="$PROJECT_ROOT/hooks/scripts/lib/utils.sh"
if [ ! -f "$UTILS_SH" ]; then
  echo "FAIL: utils.sh not found at $UTILS_SH (Task 5 가 미실행?)"
  EXIT=1
else
  TEST_FILE=$(mktemp)
  # Plan-Patch-20: heredoc unquoted EOSH 사용 → $UTILS_SH 가 caller scope 에서 expand.
  # Plan-Patch-25: 5 alias 모두 echo + payload value 매칭.
  cat > "$TEST_FILE" <<EOSH
#!/usr/bin/env bash
set -uo pipefail
source "$UTILS_SH"
parse_hook_stdin
echo "TOOL_NAME=\$TOOL_NAME"
echo "ALIAS_USE_TOOL_NAME=\$CLAUDE_TOOL_USE_TOOL_NAME"
echo "ALIAS_TOOL_NAME=\$CLAUDE_TOOL_NAME"
echo "ALIAS_USE_TOOL_INPUT=\$CLAUDE_TOOL_USE_TOOL_INPUT"
echo "ALIAS_TOOL_INPUT=\$CLAUDE_TOOL_INPUT"
echo "ALIAS_USE_INPUT=\$CLAUDE_TOOL_USE_INPUT"
EOSH
  chmod +x "$TEST_FILE"

  # minified envelope
  OUT_MIN=$(echo '{"tool_name":"Write","tool_input":{"file_path":"a.md"}}' | "$TEST_FILE" 2>&1 || true)
  echo "$OUT_MIN" | grep -q 'TOOL_NAME=Write' || PARSER_OK=false
  echo "$OUT_MIN" | grep -q 'ALIAS_USE_TOOL_NAME=Write' || PARSER_OK=false
  echo "$OUT_MIN" | grep -q 'ALIAS_TOOL_NAME=Write' || PARSER_OK=false
  echo "$OUT_MIN" | grep -q 'ALIAS_USE_TOOL_INPUT=.*file_path' || PARSER_OK=false
  echo "$OUT_MIN" | grep -q 'ALIAS_TOOL_INPUT=.*file_path' || PARSER_OK=false
  echo "$OUT_MIN" | grep -q 'ALIAS_USE_INPUT=.*file_path' || PARSER_OK=false

  # pretty envelope
  OUT_PRETTY=$(printf '{\n  "tool_name": "Edit",\n  "tool_input": {}\n}\n' | "$TEST_FILE" 2>&1 || true)
  echo "$OUT_PRETTY" | grep -q 'TOOL_NAME=Edit' || PARSER_OK=false

  rm -f "$TEST_FILE"

  if $PARSER_OK; then
    echo "PASS: stdin parser handles minified + pretty JSON, all 5 legacy aliases set"
  else
    echo "FAIL: stdin parser regression — utils.sh parse_hook_stdin 또는 5 alias 미작동"
    echo "minified output:"
    echo "$OUT_MIN" | head -10
    echo "pretty output:"
    echo "$OUT_PRETTY" | head -10
    EXIT=1
  fi
fi

echo "=== verify-migration: summary ==="
if [ $EXIT -eq 0 ]; then
  echo "ALL CHECKS PASS"
else
  echo "SOME CHECKS FAILED — see above"
fi
exit $EXIT
