#!/usr/bin/env node
// migrate-hooks.mjs — hooks.json + scripts transform per spec Section 3-2, 3-4 + OI-1, OI-7, OI-11.
// + Plan-Patch-5/6/7/8/11/15/16/17/23/30/31/32/33: state path 함수 변환, plugin cache 경로,
//   stdin parser 안전 주입 + legacy alias 5종, parse-hook-stdin.sh 통합.
// <!-- migrated-by: codex-migrate v0.1 -->

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMigrated, withMarker, markerExtForPath } from './lib/transformers.mjs';
import { applyLiteralReplace } from './migrate-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PATH_MAPPING = JSON.parse(fs.readFileSync(path.join(__dirname, 'lib/path-mapping.json'), 'utf8'));

const PLUGIN_ROOT_FROM = PATH_MAPPING.plugin_root_replace.from;
// Plan-Patch-6 + Plan-Patch-16: plugin cache 경로 (install-time substitute) + dev fallback (개발 시점).
const PLUGIN_ROOT_TO = PATH_MAPPING.plugin_root_replace.to;
const PLUGIN_ROOT_DEV = PATH_MAPPING.plugin_root_replace.dev_fallback ?? '$(git rev-parse --show-toplevel)/hooks/scripts';

// transformHooksJson(cc, mode = 'template')
// mode='template' → ${PLUGIN_SHA} placeholder 보존 (hooks-template.json install 가이드용).
// mode='dev'      → dev_fallback (개발 시점, hooks/hooks.json) — 직접 실행 가능.
export function transformHooksJson(cc, mode = 'template') {
  const targetBase = mode === 'dev' ? PLUGIN_ROOT_DEV : PLUGIN_ROOT_TO;
  const out = JSON.parse(JSON.stringify(cc));
  for (const event of Object.keys(out.hooks ?? {})) {
    for (const slot of out.hooks[event]) {
      for (const h of slot.hooks ?? []) {
        if (h.command) {
          h.command = h.command.split(`${PLUGIN_ROOT_FROM}/hooks/scripts`).join(targetBase);
          // sensors/health 도 sibling path 로
          h.command = h.command.split(`${PLUGIN_ROOT_FROM}/sensors`).join(targetBase.replace(/\/hooks\/scripts$/, '/sensors'));
          h.command = h.command.split(`${PLUGIN_ROOT_FROM}/health`).join(targetBase.replace(/\/hooks\/scripts$/, '/health'));
          h.command = h.command.split(PLUGIN_ROOT_FROM).join(targetBase.replace(/\/hooks\/scripts$/, ''));
        }
      }
    }
  }
  return out;
}

// Plan-Patch-8 (deep-review C4): vendor 가 실제 사용하는 5종 변수명 모두 export.
export const STDIN_PARSER_HEADER = `# --- begin codex-hook-stdin-parser (auto-injected) ---
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
`;

// Plan-Patch-7 (deep-review C3): vendor 본문에 $(cat) 가 등장하면 자동 주입 skip.
const VENDOR_CAT_PATTERN = /\$\(\s*cat\s*\)/;

export function injectStdinParser(src) {
  if (src.includes('begin codex-hook-stdin-parser')) return src;

  // 안전성 검사 — vendor 가 이미 stdin 을 직접 소비하면 자동 주입 skip + Phase-C TODO 마커
  if (VENDOR_CAT_PATTERN.test(src)) {
    const lines = src.split('\n');
    const catLines = [];
    lines.forEach((l, i) => { if (VENDOR_CAT_PATTERN.test(l)) catLines.push(i + 1); });
    const todo = `# TODO(Phase-C): pre-existing $(cat) at lines ${catLines.join(',')} — manual stdin migration required.\n# Auto-injection skipped to avoid stdin double-consumption (deep-review C3).\n`;
    if (src.startsWith('#!')) {
      const firstNl = src.indexOf('\n');
      return src.slice(0, firstNl + 1) + todo + src.slice(firstNl + 1);
    }
    return todo + src;
  }

  // 환경변수 전용 vendor 스크립트만 안전 주입.
  if (src.startsWith('#!')) {
    const firstNl = src.indexOf('\n');
    return src.slice(0, firstNl + 1) + STDIN_PARSER_HEADER + src.slice(firstNl + 1);
  }
  return STDIN_PARSER_HEADER + src;
}

// Plan-Patch-5 (v3-라운드 deep-review C1) + Plan-Patch-15 (v3-라운드 재리뷰 C1) + Plan-Patch-23 (v3-라운드 3차 C1)
// + Plan-Patch-30 (deep-review v6 4차 C1): character class `}` 제외 → vendor `${var}.md` 절단 회피.
const STATE_TRANSFORM_MARKER = '# state-path migrated by codex-migrate v0.1';
// Plan-Patch-30: character class `[^"'\s>]+` 로 통일 (assignmentRe 와 일관). `}`/`]`/`)` 모두 허용.
const STATE_REL_PATTERN = '\\.claude/(deep-work[/.\\-][^"\'\\s>]+)';
const STATE_REL_WITH_PREFIX = '(?:\\$\\{?[A-Za-z_][A-Za-z0-9_:\\-$]*\\}?\\/|\\.\\/|\\.\\.\\/)?\\.claude/(deep-work[/.\\-][^"\'\\s>]+)';

export function applyStatePathReplace(src) {
  if (src.includes(STATE_TRANSFORM_MARKER)) return src;

  let out = src;
  let touched = false;

  // (1) write sites — > → write_state_file (overwrite), >> → write_state_file_append (Plan-Patch-31).
  out = out.replace(new RegExp(`(echo\\s+(?:"[^"]*"|'[^']*'|\\S+))\\s*(>>?)\\s*["']?${STATE_REL_WITH_PREFIX}["']?`, 'g'), (m, echoCmd, op, rel) => {
    touched = true;
    const contentMatch = echoCmd.match(/^echo\s+(.+)$/);
    const content = contentMatch ? contentMatch[1] : '""';
    const fn = op === '>>' ? 'write_state_file_append' : 'write_state_file';
    return `${fn} "${rel}" ${content}`;
  });
  // printf 형식 redirect — > / >> 둘 다 처리 (Plan-Patch-31).
  out = out.replace(new RegExp(`(printf\\s+(?:"[^"]*"|'[^']*'|\\S+)(?:\\s+\\S+)*)\\s*(>>?)\\s*["']?${STATE_REL_WITH_PREFIX}["']?`, 'g'), (m, printfCmd, op, rel) => {
    touched = true;
    const fn = op === '>>' ? 'write_state_file_append' : 'write_state_file';
    return `${fn} "${rel}" "$(${printfCmd})"`;
  });
  // tee — 항상 write_state_file (overwrite).
  out = out.replace(new RegExp(`\\|\\s*tee\\s+["']?${STATE_REL_WITH_PREFIX}["']?`, 'g'), (m, rel) => {
    touched = true;
    return `| { content=$(cat); write_state_file "${rel}" "$content"; printf '%s' "$content"; }`;
  });
  // Plan-Patch-23 + Plan-Patch-31 (deep-review v6 4차 C3): stderr fd-redirect.
  out = out.replace(new RegExp(`(\\s|^)2(>>?)\\s*["']?${STATE_REL_WITH_PREFIX}["']?`, 'g'), (m, sp, op, rel) => {
    touched = true;
    const fn = op === '>>' ? 'write_state_file_append' : 'write_state_file';
    return `${sp}2> >(while IFS= read -r line; do ${fn} "${rel}" "$line"; done)`;
  });
  // Plan-Patch-23 + Plan-Patch-31: line-leading append redirect — >> = append.
  out = out.replace(new RegExp(`(^\\s+)(>>?)\\s+["']?${STATE_REL_WITH_PREFIX}["']?`, 'gm'), (m, lead, op, rel) => {
    touched = true;
    const fn = op === '>>' ? 'write_state_file_append' : 'write_state_file';
    return `${lead}> >(while IFS= read -r line; do ${fn} "${rel}" "$line"; done)`;
  });
  // mv/cp — destination 이 state path 인 케이스. Plan-Patch-23: optional prefix 허용.
  out = out.replace(new RegExp(`\\b(mv|cp)\\s+(\\S+|"[^"]+"|'[^']+')\\s+["']?${STATE_REL_WITH_PREFIX}["']?`, 'g'), (m, cmd, src1, rel) => {
    touched = true;
    return `${cmd} ${src1} "$PROJECT_ROOT/.codex/${rel}"`;
  });

  // (2) read sites — cat / jq / grep / source / [[ -f|-r|-e → read_state_file
  out = out.replace(new RegExp(`\\bcat\\s+["']?${STATE_REL_WITH_PREFIX}["']?`, 'g'), (m, rel) => {
    touched = true;
    return `read_state_file "${rel}"`;
  });
  out = out.replace(new RegExp(`\\b(jq|grep)\\b([^|]*?)\\s+["']?${STATE_REL_WITH_PREFIX}["']?`, 'g'), (m, cmd, args, rel) => {
    touched = true;
    return `read_state_file "${rel}" | ${cmd}${args}`;
  });
  out = out.replace(new RegExp(`\\bsource\\s+["']?${STATE_REL_WITH_PREFIX}["']?`, 'g'), (m, rel) => {
    touched = true;
    return `source <(read_state_file "${rel}")`;
  });
  out = out.replace(new RegExp(`\\[\\[\\s+-([fer])\\s+["']?${STATE_REL_WITH_PREFIX}["']?\\s+\\]\\]`, 'g'), (m, flag, rel) => {
    touched = true;
    return `[[ -n "$(read_state_file \\"${rel}\\" 2>/dev/null)" ]]`;
  });
  // Plan-Patch-23: vendor 의 함수 호출 (read_frontmatter_field 등) — read site 로 분류.
  const VENDOR_READ_FUNCS = ['read_frontmatter_field', 'read_session_state', 'read_pointer'];
  for (const fn of VENDOR_READ_FUNCS) {
    out = out.replace(new RegExp(`\\b${fn}\\s+["']?${STATE_REL_WITH_PREFIX}["']?`, 'g'), (m, rel) => {
      touched = true;
      return `${fn} <(read_state_file "${rel}")`;
    });
  }
  // Plan-Patch-23 + Plan-Patch-32 + Plan-Patch-32b (vendor leading-slash 변형):
  // bash glob 변환 — vendor 의 `*"/.claude/...` (file-tracker.sh:108, phase-guard.sh:672)
  // 와 `*".claude/...` 두 형식 모두 커버.
  out = out.split('\n').map((line) => {
    if (!/\*"\/?\.claude\/deep-work[/.\-]/.test(line)) return line;
    touched = true;
    const replaced = line.replace(/\*"(\/?)\.claude\/(deep-work[/.\-][^"]*)"\*/g, '*"$1.codex/$2"*');
    if (replaced.includes('# state-glob-pattern')) return replaced; // idempotent
    return `${replaced}  # state-glob-pattern (codex-migrate)`;
  }).join('\n');

  // (3) path assignment sites — local var="$PROJECT_ROOT/.claude/deep-work..."
  const assignmentRe = /(=\s*["']?[^"'\s]*?)\.claude\/(deep-work[/.\-][^"'\s>]+)/g;
  if (assignmentRe.test(out)) {
    touched = true;
    out = out.replace(/(=\s*["']?[^"'\s]*?)\.claude\/(deep-work[/.\-][^"'\s>]+)/g, (m, prefix, rel) => {
      return `${prefix}.codex/${rel}`;
    });
  }

  // (3.5) comment-line bare path docs: vendor 의 # 코멘트 안 `.claude/deep-work...`
  // (notify.sh:22 의 사용 예시, phase-transition.sh:58 의 backtick 예시) → `.codex/deep-work` 로
  // 단순 치환. TODO(Phase-C) 마커 라인은 보존.
  out = out.split('\n').map((line) => {
    if (!/^\s*#/.test(line)) return line;
    if (line.includes('TODO(Phase-C)')) return line;
    if (!/\.claude\/deep-work[/.\-]/.test(line)) return line;
    touched = true;
    return line.replace(/\.claude\/deep-work/g, '.codex/deep-work');
  }).join('\n');

  // (4) ambiguous — 잔존 케이스 모든 라인 수집. catch-all: 어떤 위치의 .claude/deep-work[/.\-]
  // 든 (bare comment, partial bash glob 등) 매칭. v6 의 buggy `\\.\\??/?` 정규식 정정.
  const remainingPattern = /\.claude\/deep-work[/.\-]/g;
  const ambiguousLines = [];
  out.split('\n').forEach((l, i) => {
    if (remainingPattern.test(l)) ambiguousLines.push(i + 1);
    remainingPattern.lastIndex = 0;
  });
  if (ambiguousLines.length > 0) {
    touched = true;
    out = `# TODO(Phase-C): ambiguous .claude/deep-work* path access at vendor lines ${ambiguousLines.join(',')} — manual review needed (deep-review v3-round C1).\n` + out;
  }

  if (touched) {
    out = `${STATE_TRANSFORM_MARKER}\n` + out;
  }
  return out;
}

export function generateUtilsSh() {
  // Plan-Patch-7 (deep-review C8): parse_hook_stdin 함수도 본 utils.sh 에 통합.
  return `#!/usr/bin/env bash
# hooks/scripts/lib/utils.sh — function-based state API + stdin parser per spec Section 3-2.
# <!-- migrated-by: codex-migrate v0.1 -->
# .claude/ legacy fallback: read-only per-file import on first read.

set -euo pipefail

PROJECT_ROOT="\${PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

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
  printf '%s\n' "$content" >> "$target"
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
# Usage in hook scripts:  source "\$(dirname "\$0")/lib/utils.sh" && parse_hook_stdin
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
`;
}

export function generateHooksTemplate(cc) {
  const transformed = transformHooksJson(cc, 'template');
  return {
    description: 'codex-deep-work first-run install template — copy into <repo>/.codex/hooks.json (A\' First-Run Install Pattern, OI-11). ${PLUGIN_SHA} 는 install 시 사용자 환경의 marketplace.json sha 로 substitute.',
    version: '0.1.0',
    install_target: '<repo>/.codex/hooks.json',
    expansion_required: ['${PLUGIN_SHA}'],
    expansion_source: '<user_repo>/.agents/plugins/marketplace.json (codex-deep-suite plugin sha)',
    ...transformed,
  };
}

const TARGET_EXTS_HOOK_SCRIPTS = new Set(['.sh', '.js', '.mjs']);
const UTILS_SOURCE_LINE = 'source "$(dirname "$0")/lib/utils.sh"';

function processHookScript(srcFile, dstFile, force) {
  const content = fs.readFileSync(srcFile, 'utf8');
  if (!force && fs.existsSync(dstFile) && isMigrated(fs.readFileSync(dstFile, 'utf8'))) {
    return { skipped: true };
  }

  let transformed = applyLiteralReplace(content);
  // Plan-Patch-5: state path 함수 변환 — bash 만 (js 는 자체 fs API 사용)
  if (srcFile.endsWith('.sh')) {
    transformed = applyStatePathReplace(transformed);
    // utils.sh source 자동 주입 — state 함수 또는 stdin parser 가 변환에서 사용됐으면
    if (transformed.includes('read_state_file') || transformed.includes('write_state_file') || transformed.includes('parse_hook_stdin')) {
      if (!transformed.includes(UTILS_SOURCE_LINE)) {
        if (transformed.startsWith('#!')) {
          const firstNl = transformed.indexOf('\n');
          transformed = transformed.slice(0, firstNl + 1) + UTILS_SOURCE_LINE + '\n' + transformed.slice(firstNl + 1);
        } else {
          transformed = UTILS_SOURCE_LINE + '\n' + transformed;
        }
      }
    }
    // stdin parser 안전 주입 (Plan-Patch-7)
    transformed = injectStdinParser(transformed);
  }

  // marker — withMarker(content, ext) 사용 (Plan-Patch-11)
  transformed = withMarker(transformed, markerExtForPath(srcFile));

  fs.mkdirSync(path.dirname(dstFile), { recursive: true });
  fs.writeFileSync(dstFile, transformed);
  return { written: true };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const vendor = process.argv[2] || `${process.env.HOME}/Dev/codex-deep-work/vendor/claude-deep-work-v6.4.0`;
  const target = process.argv[3] || `${process.env.HOME}/Dev/codex-deep-work`;
  const force = process.argv.includes('--force');

  // 1. hooks.json — mode='dev', dev_fallback (개발 시점 직접 실행 가능)
  const ccHooks = JSON.parse(fs.readFileSync(path.join(vendor, 'hooks/hooks.json'), 'utf8'));
  const outHooks = transformHooksJson(ccHooks, 'dev');
  fs.mkdirSync(path.join(target, 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(target, 'hooks/hooks.json'), JSON.stringify(outHooks, null, 2) + '\n');

  // 2. hooks-template.json (A' first-run install) — ${PLUGIN_SHA} placeholder 보존
  fs.writeFileSync(path.join(target, 'hooks/hooks-template.json'), JSON.stringify(generateHooksTemplate(ccHooks), null, 2) + '\n');

  // 3. utils.sh (state API + stdin parser 통합)
  fs.mkdirSync(path.join(target, 'hooks/scripts/lib'), { recursive: true });
  fs.writeFileSync(path.join(target, 'hooks/scripts/lib/utils.sh'), generateUtilsSh());

  // 4. hook scripts (.sh, .js, .mjs)
  const scriptsRoot = path.join(vendor, 'hooks/scripts');
  let total = 0, written = 0, skipped = 0;
  for (const f of fs.readdirSync(scriptsRoot)) {
    const srcFile = path.join(scriptsRoot, f);
    if (fs.statSync(srcFile).isDirectory()) continue;
    if (!TARGET_EXTS_HOOK_SCRIPTS.has(path.extname(f))) continue;
    if (f.endsWith('.test.js') || f.endsWith('.test.sh')) continue;  // fixture 는 Task 6
    const dstFile = path.join(target, 'hooks/scripts', f);
    total++;
    const r = processHookScript(srcFile, dstFile, force);
    if (r.skipped) skipped++; else written++;
  }
  console.error(`migrate-hooks: hooks.json + hooks-template.json + utils.sh + scripts (total=${total} written=${written} skipped=${skipped})`);
}
