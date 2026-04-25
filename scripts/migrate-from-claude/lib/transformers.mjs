// codex-deep-work migration helpers — AST/regex transforms
// <!-- migrated-by: codex-migrate v0.1 -->

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

export const MIGRATION_MARKER = '<!-- migrated-by: codex-migrate v0.1 -->';

export function isMigrated(content) {
  return content.includes(MIGRATION_MARKER);
}

export function withMarker(content, prefix = '<!--') {
  if (isMigrated(content)) return content;
  if (prefix === '<!--') {
    return MIGRATION_MARKER + '\n' + content;
  }
  // shell/js style comment
  const commentLine = prefix === '#' ? `# migrated-by: codex-migrate v0.1` : `// migrated-by: codex-migrate v0.1`;
  return commentLine + '\n' + content;
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
