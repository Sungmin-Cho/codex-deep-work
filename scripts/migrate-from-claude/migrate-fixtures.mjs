#!/usr/bin/env node
// migrate-fixtures.mjs — test fixture stdin envelope per spec Section 4-2.
// <!-- migrated-by: codex-migrate v0.1 -->

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMigrated, MIGRATION_MARKER } from './lib/transformers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Plan-Patch-9 (deep-review C5): vendor 의 5종 변수명 모두 처리.
const ENV_TO_STDIN = [
  { env: 'CLAUDE_TOOL_USE_TOOL_NAME', stdin: 'tool_name' },
  { env: 'CLAUDE_TOOL_NAME',          stdin: 'tool_name' },
  { env: 'CLAUDE_TOOL_USE_TOOL_INPUT', stdin: 'tool_input' },
  { env: 'CLAUDE_TOOL_INPUT',          stdin: 'tool_input' },
  { env: 'CLAUDE_TOOL_USE_INPUT',      stdin: 'tool_input' },
];

// Plan-Patch-22 (deep-review v3-round C3): multi-level nesting (3+) 검출 시 자동 변환 skip + Phase-C TODO 마커.
// Plan-Patch-24 (deep-review v3-라운드 3차 C2): nesting-aware brace-balanced 추적 + string literal skip + array-of-objects 카운트.
function findJsonStringifyDepth(s) {
  let i = 0;
  while ((i = s.indexOf('JSON.stringify(', i)) !== -1) {
    const start = s.indexOf('{', i);
    if (start === -1) break;
    let depth = 0, maxDepth = 0;
    for (let j = start; j < s.length; j++) {
      const ch = s[j];
      // string literal skip — quoted strings 안의 { 무시
      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        j++;
        while (j < s.length && s[j] !== quote) {
          if (s[j] === '\\') j++;
          j++;
        }
        continue;
      }
      if (ch === '{') { depth++; maxDepth = Math.max(maxDepth, depth); }
      else if (ch === '}') {
        depth--;
        if (depth === 0) break;
      }
      else if (ch === '[' && j + 1 < s.length && /\s*\{/.test(s.substring(j + 1, j + 4))) {
        // [{ — array of objects, treat as nested object marker
        maxDepth = Math.max(maxDepth, depth + 1);
      }
    }
    if (maxDepth >= 2) return maxDepth;
    i = start + 1;
  }
  return 0;
}

export function convertEnvFixtureToStdin(src) {
  if (!/CLAUDE_TOOL/.test(src)) return src;
  if (src.includes('TODO(Phase-C): multi-level nesting')) return src;

  if (findJsonStringifyDepth(src) >= 2) {
    return `// TODO(Phase-C): multi-level nesting in env fixture — manual stdin migration required (deep-review v3-round C3 / 3차 C2).\n` + src;
  }

  // env 객체 inline 패턴: env: {...process.env, CLAUDE_TOOL_*: <X>, [other: ...]}
  const re = /env\s*:\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gs;
  return src.replace(re, (match, body) => {
    if (!/CLAUDE_TOOL/.test(body)) return match;

    const stdinValues = {};  // { tool_name: '...', tool_input: '...' }
    for (const { env, stdin } of ENV_TO_STDIN) {
      if (stdinValues[stdin]) continue;
      const m = body.match(new RegExp(`${env}\\s*:\\s*([^,]+(?:JSON\\.stringify\\([^)]*\\))?[^,\\n}]*)`));
      if (m) stdinValues[stdin] = m[1].trim();
    }

    let cleanBody = body;
    for (const { env } of ENV_TO_STDIN) {
      const stripRe = new RegExp(`,?\\s*${env}\\s*:\\s*[^,]+(?:JSON\\.stringify\\([^)]*\\))?[^,\\n}]*`, 'g');
      cleanBody = cleanBody.replace(stripRe, '');
    }
    cleanBody = cleanBody.replace(/,\s*\}/g, '}').replace(/,\s*$/, '');

    const envOut = `env: {${cleanBody.trim()}}`;
    const tn = stdinValues.tool_name ?? "''";
    const ti = stdinValues.tool_input ?? '{}';
    const stdinExpr = `input: JSON.stringify({ tool_name: ${tn}, tool_input: ${ti}, hook_event_name: 'PreToolUse' })`;
    return `${envOut}, ${stdinExpr}`;
  });
}

function processFixtureFile(srcFile, dstFile, force) {
  const content = fs.readFileSync(srcFile, 'utf8');
  if (!force && fs.existsSync(dstFile) && isMigrated(fs.readFileSync(dstFile, 'utf8'))) {
    return { skipped: true };
  }
  let transformed = convertEnvFixtureToStdin(content);
  if (!isMigrated(transformed)) {
    transformed = `// migrated-by: codex-migrate v0.1\n` + transformed;
  }
  fs.mkdirSync(path.dirname(dstFile), { recursive: true });
  fs.writeFileSync(dstFile, transformed);
  return { written: true };
}

function* walkTests(dir, root = dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      yield* walkTests(full, root);
    } else {
      const lower = ent.name.toLowerCase();
      if (lower.endsWith('.test.js') || lower.endsWith('.test.mjs') || lower.endsWith('.spec.js')) {
        yield { full, rel: path.relative(root, full) };
      }
    }
  }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const vendor = process.argv[2] || `${process.env.HOME}/Dev/codex-deep-work/vendor/claude-deep-work-v6.4.0`;
  const target = process.argv[3] || `${process.env.HOME}/Dev/codex-deep-work`;
  const force = process.argv.includes('--force');

  const subdirs = ['hooks/scripts', 'sensors', 'health', 'templates', 'tests', 'skills'];
  let total = 0, written = 0, skipped = 0;
  for (const sub of subdirs) {
    const subSrc = path.join(vendor, sub);
    if (!fs.existsSync(subSrc)) continue;
    for (const { full, rel } of walkTests(subSrc)) {
      const dstFile = path.join(target, sub, rel);
      total++;
      const r = processFixtureFile(full, dstFile, force);
      if (r.skipped) skipped++; else written++;
    }
  }
  console.error(`migrate-fixtures: total=${total} written=${written} skipped=${skipped}`);
}
