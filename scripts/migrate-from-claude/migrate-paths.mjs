#!/usr/bin/env node
// migrate-paths.mjs — non-state literal codemod per spec Section 3-2.
// state path codemod (.claude/deep-work/...) 는 본 스크립트 범위 밖 — Task 5 (migrate-hooks.mjs) 의 함수 API 변환으로 처리.
// <!-- migrated-by: codex-migrate v0.1 -->

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withMarker, isMigrated, MIGRATION_MARKER } from './lib/transformers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PATH_MAPPING = JSON.parse(fs.readFileSync(path.join(__dirname, 'lib/path-mapping.json'), 'utf8'));

const STATE_LITERAL_PATTERNS = [
  /\.claude\/deep-work\//,
  /\.claude\/deep-work\.[A-Za-z0-9-]+\.md/,
  /\.claude\/\.hook-tool-input/,
  /\.claude\/deep-work-current-session/,
  /\.claude\/deep-work-sessions/,
  /\.claude\/deep-work-guard-errors/,
  /\.claude\/deep-work-profile/,
];

export function isStateLiteral(s) {
  return STATE_LITERAL_PATTERNS.some(re => re.test(s));
}

export function applyLiteralReplace(src) {
  let out = src;
  for (const [from, to] of Object.entries(PATH_MAPPING.literal_replace)) {
    if (from === 'comment') continue;
    if (isStateLiteral(from)) continue;
    // simple literal replace (escape regex metachars)
    const re = new RegExp(from.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&'), 'g');
    out = out.replace(re, to);
  }
  return out;
}

const TARGET_EXTS = new Set(['.js', '.mjs', '.cjs', '.sh', '.json', '.md']);
const FORBIDDEN_DIRS = new Set(['node_modules', '.git', 'vendor', 'scripts/migrate-from-claude']);
const COMMENT_PREFIX = { '.js': '//', '.mjs': '//', '.cjs': '//', '.sh': '#', '.json': null, '.md': '<!--' };

function* walk(dir, root = dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(root, full);
    if (ent.isDirectory()) {
      if (FORBIDDEN_DIRS.has(ent.name)) continue;
      yield* walk(full, root);
    } else if (TARGET_EXTS.has(path.extname(ent.name))) {
      yield { full, rel };
    }
  }
}

function processFile(srcPath, dstPath, ext, force) {
  const content = fs.readFileSync(srcPath, 'utf8');
  if (!force && fs.existsSync(dstPath) && isMigrated(fs.readFileSync(dstPath, 'utf8'))) {
    return { skipped: true };
  }
  let transformed = applyLiteralReplace(content);
  if (ext !== '.json' && COMMENT_PREFIX[ext]) {
    const prefix = COMMENT_PREFIX[ext];
    if (!isMigrated(transformed)) {
      if (prefix === '<!--') {
        transformed = MIGRATION_MARKER + '\n' + transformed;
      } else {
        transformed = `${prefix} migrated-by: codex-migrate v0.1\n` + transformed;
      }
    }
  }
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  fs.writeFileSync(dstPath, transformed);
  return { written: true };
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const vendor = process.argv[2] || `${process.env.HOME}/Dev/codex-deep-work/vendor/claude-deep-work-v6.4.0`;
  const target = process.argv[3] || `${process.env.HOME}/Dev/codex-deep-work`;
  const force = process.argv.includes('--force');
  const subdirs = ['sensors', 'health', 'templates'];

  let total = 0, written = 0, skipped = 0;
  for (const sub of subdirs) {
    const subSrc = path.join(vendor, sub);
    if (!fs.existsSync(subSrc)) continue;
    for (const { full, rel } of walk(subSrc)) {
      total++;
      const dstPath = path.join(target, sub, rel);
      const ext = path.extname(rel);
      const r = processFile(full, dstPath, ext, force);
      if (r.skipped) skipped++; else if (r.written) written++;
    }
  }
  console.error(`migrate-paths: total=${total} written=${written} skipped=${skipped}`);
}
