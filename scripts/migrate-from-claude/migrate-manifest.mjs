#!/usr/bin/env node
// migrate-manifest.mjs — package.json transform per spec Section 2-1, 2-6.
// <!-- migrated-by: codex-migrate v0.1 -->

import fs from 'node:fs';
import path from 'node:path';

const RENAMES = {
  '.claude-plugin/': '.codex-plugin/',
  'CLAUDE.md': 'AGENTS.md',
};

const FILES_ADD = ['README.ko.md', 'CHANGELOG.md', 'CHANGELOG.ko.md', 'AGENTS.md', 'LICENSE'];

const KEYWORDS_REMOVE = ['claude-code', 'claude-code-plugin', 'agent-team'];
// 5차 W7: discoverability — description 의 "Evidence-Driven Development Protocol" / "TDD enforcement" 와
// 일관되게 keywords 에도 노출 (npm search hit 율).
const KEYWORDS_ADD = ['codex', 'evidence-driven', 'tdd'];

const NAME_REMAP = {
  '@claude-deep-work/deep-work': 'codex-deep-work',
};

const TARGET_VERSION = '0.1.0';

export function applyManifestTransform(cc) {
  const out = { ...cc };

  if (NAME_REMAP[cc.name]) out.name = NAME_REMAP[cc.name];
  out.version = TARGET_VERSION;

  // files array
  const files = (cc.files || []).map(f => RENAMES[f] ?? f);
  for (const f of FILES_ADD) {
    if (!files.includes(f)) files.push(f);
  }
  out.files = files;

  // keywords
  const kws = (cc.keywords || []).filter(k => !KEYWORDS_REMOVE.includes(k));
  for (const k of KEYWORDS_ADD) {
    if (!kws.includes(k)) kws.push(k);
  }
  out.keywords = kws;

  return out;
}

// Plan-Patch-27 (deep-review v3-라운드 3차 C5): applyMergeStrategy 함수 추출.
// existing (codex-deep-work 의 기존 package.json) 의 모든 필드를 보존하고 transformed 의 의도된 필드만 명시적으로 덮어쓰기.
// type / devDependencies / exports / engines / packageManager 등 사용자가 추가한 필드 보존.
export function applyMergeStrategy(existing, transformed) {
  const merged = existing ? { ...existing } : {};
  merged.name = transformed.name;
  merged.version = transformed.version;
  merged.files = transformed.files;
  merged.keywords = transformed.keywords;
  merged.description = existing?.description ?? transformed.description;
  merged.scripts = existing?.scripts ?? { test: 'node --test' };
  merged.license = existing?.license ?? transformed.license ?? 'MIT';
  merged.repository = existing?.repository ?? {
    type: 'git',
    url: 'https://github.com/Sungmin-Cho/codex-deep-work',
  };
  merged.author = existing?.author ?? transformed.author ?? 'sungmin';
  return merged;
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const vendor = process.argv[2] || `${process.env.HOME}/Dev/codex-deep-work/vendor/claude-deep-work-v6.4.0`;
  const target = process.argv[3] || `${process.env.HOME}/Dev/codex-deep-work`;
  const force = process.argv.includes('--force');

  const ccPkgPath = path.join(vendor, 'package.json');
  const targetPkgPath = path.join(target, 'package.json');

  const cc = JSON.parse(fs.readFileSync(ccPkgPath, 'utf8'));
  const existing = fs.existsSync(targetPkgPath) ? JSON.parse(fs.readFileSync(targetPkgPath, 'utf8')) : null;

  if (existing && !force) {
    const expected = applyManifestTransform(cc);
    const sameFiles = JSON.stringify([...(existing.files ?? [])].sort()) === JSON.stringify([...(expected.files ?? [])].sort());
    const sameKeywords = JSON.stringify([...(existing.keywords ?? [])].sort()) === JSON.stringify([...(expected.keywords ?? [])].sort());
    if (sameFiles && sameKeywords && existing.name === expected.name && existing.version === expected.version) {
      console.error(`migrate-manifest: ${targetPkgPath} already migrated, skipping (use --force to override)`);
      process.exit(0);
    }
  }

  const transformed = applyManifestTransform(cc);
  const merged = applyMergeStrategy(existing, transformed);

  fs.writeFileSync(targetPkgPath, JSON.stringify(merged, null, 2) + '\n');
  console.error(`migrate-manifest: wrote ${targetPkgPath}`);
}
