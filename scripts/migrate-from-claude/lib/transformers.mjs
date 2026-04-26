// codex-deep-work migration helpers — AST/regex transforms
// <!-- migrated-by: codex-migrate v0.1 -->
// Plan-Patch-11 (deep-review C7): MIGRATION_MARKERS 형식별 분리.

import fs from 'node:fs';

const TOOL_MAPPING = JSON.parse(
  fs.readFileSync(new URL('./tool-mapping.json', import.meta.url), 'utf8')
);
const PATH_MAPPING = JSON.parse(
  fs.readFileSync(new URL('./path-mapping.json', import.meta.url), 'utf8')
);

export function loadRules() {
  return { tool: TOOL_MAPPING, path: PATH_MAPPING };
}

// 형식별 marker. md = HTML comment, sh = # comment, js = // comment.
export const MIGRATION_MARKERS = {
  md: '<!-- migrated-by: codex-migrate v0.1 -->',
  sh: '# migrated-by: codex-migrate v0.1',
  js: '// migrated-by: codex-migrate v0.1',
};

// 하위 호환 — 기존 코드가 import 하는 단일 상수 (md form 으로 alias).
export const MIGRATION_MARKER = MIGRATION_MARKERS.md;

export function isMigrated(content) {
  return Object.values(MIGRATION_MARKERS).some(m => content.includes(m));
}

// withMarker(content, ext) — ext 는 'md' | 'sh' | 'js'. 미지정 시 'md' default (하위 호환).
// Plan-Patch-17 (deep-review v3-round C5): shebang 감지 시 marker 를 그 다음 라인에 삽입.
// '.sh'/'.js' 의 interpreter line (`#!/usr/bin/env bash`) 이 깨지면 직접 실행 불가.
export function withMarker(content, ext = 'md') {
  if (isMigrated(content)) return content;
  if (ext === 'none') return content;
  const marker = MIGRATION_MARKERS[ext] ?? MIGRATION_MARKERS.md;
  if (content.startsWith('#!')) {
    const firstNl = content.indexOf('\n');
    if (firstNl < 0) return content + '\n' + marker + '\n';
    return content.slice(0, firstNl + 1) + marker + '\n' + content.slice(firstNl + 1);
  }
  return marker + '\n' + content;
}

// 파일 확장자 → marker 형식 도우미. caller 가 path.extname() 결과를 넘기면 알맞게 분기.
export function markerExtForPath(p) {
  if (p.endsWith('.json')) return 'none';
  if (p.endsWith('.md')) return 'md';
  if (p.endsWith('.sh') || p.endsWith('.bash')) return 'sh';
  if (p.endsWith('.js') || p.endsWith('.mjs') || p.endsWith('.cjs') || p.endsWith('.ts')) return 'js';
  return 'md';  // unknown — md 형식이 가장 안전 (HTML comment 는 대부분 컨텍스트에서 무해).
}

// Phase B 에서 추가 구현될 함수들의 stub
export function applyToolMapping(skillBody) {
  throw new Error('applyToolMapping: not yet implemented (Phase B)');
}

export function applyPathMapping(scriptBody) {
  throw new Error('applyPathMapping: not yet implemented (Phase B)');
}

export function injectStdinParser(hookScriptBody) {
  throw new Error('injectStdinParser: not yet implemented (Phase B, OI-1 dependent)');
}
