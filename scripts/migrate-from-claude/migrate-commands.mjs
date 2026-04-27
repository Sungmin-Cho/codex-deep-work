#!/usr/bin/env node
// migrate-commands.mjs — commands/*.md transform per spec Section 2-4, 3-1, 3-3.
// <!-- migrated-by: codex-migrate v0.1 -->

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultTargetRoot, defaultVendorRoot } from './lib/default-paths.mjs';
import { isMigrated, MIGRATION_MARKER } from './lib/transformers.mjs';
import { transformSkillBody } from './migrate-skills.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function splitFrontmatter(src) {
  const m = src.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (!m) return { frontmatter: '', body: src };
  return { frontmatter: m[1], body: m[2] };
}

function mapCommandCapability(tool) {
  if (['Read', 'Grep', 'Glob'].includes(tool)) return 'workspace-read/search';
  if (['Write', 'Edit', 'MultiEdit'].includes(tool)) return 'apply_patch';
  if (tool === 'Bash') return 'exec_command';
  if (tool === 'Agent') return 'spawn_agent';
  if (tool === 'Skill') return 'skill invocation';
  if (tool === 'AskUserQuestion') return 'numbered-choice prompt';
  return tool;
}

export function transformCommandFrontmatter(frontmatter) {
  return frontmatter.replace(/^allowed-tools:\s*(.+)$/m, (_m, raw) => {
    const mapped = [];
    for (const tool of raw.split(',').map(s => s.trim()).filter(Boolean)) {
      const capability = mapCommandCapability(tool);
      if (!mapped.includes(capability)) mapped.push(capability);
    }
    return `codex-capabilities: ${mapped.join(', ')}`;
  });
}

export function transformCommandFile(src) {
  const { frontmatter, body } = splitFrontmatter(src);
  // skills 와 동일 tool/path 매핑. command 는 first-run install 대상 아님.
  const transformed = transformSkillBody(body, '__command__');
  return transformCommandFrontmatter(frontmatter) + transformed;
}

function processCommandFile(srcFile, dstFile, force) {
  const content = fs.readFileSync(srcFile, 'utf8');
  if (!force && fs.existsSync(dstFile) && isMigrated(fs.readFileSync(dstFile, 'utf8'))) {
    return { skipped: true };
  }
  let transformed = transformCommandFile(content);
  if (!isMigrated(transformed)) {
    // frontmatter 가 있으면 그 다음에 marker
    const { frontmatter, body } = splitFrontmatter(transformed);
    transformed = frontmatter + MIGRATION_MARKER + '\n' + body;
  }
  fs.mkdirSync(path.dirname(dstFile), { recursive: true });
  fs.writeFileSync(dstFile, transformed);
  return { written: true };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const vendor = process.argv[2] || defaultVendorRoot();
  const target = process.argv[3] || defaultTargetRoot();
  const force = process.argv.includes('--force');

  const cmdRoot = path.join(vendor, 'commands');
  if (!fs.existsSync(cmdRoot)) {
    console.error(`migrate-commands: vendor commands/ not found`);
    process.exit(1);
  }

  let total = 0, written = 0, skipped = 0;
  for (const f of fs.readdirSync(cmdRoot)) {
    if (!f.endsWith('.md')) continue;
    const srcFile = path.join(cmdRoot, f);
    const dstFile = path.join(target, 'commands', f);
    total++;
    const r = processCommandFile(srcFile, dstFile, force);
    if (r.skipped) skipped++; else written++;
  }
  console.error(`migrate-commands: total=${total} written=${written} skipped=${skipped}`);
}
