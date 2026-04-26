#!/usr/bin/env node
// migrate-agents.mjs — agents/*.md transform per spec Section 2-5, 3-1, 3-6.
// 1차 변환 — Phase C step 14 의 사람 검토 (SendMessage 패턴 1/2 분리, Branch A sequential chain) 대상.
// <!-- migrated-by: codex-migrate v0.1 -->

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultTargetRoot, defaultVendorRoot } from './lib/default-paths.mjs';
import { isMigrated, MIGRATION_MARKER } from './lib/transformers.mjs';
import { transformSkillBody } from './migrate-skills.mjs';
import { splitFrontmatter } from './migrate-commands.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function extractToolWhitelistGuidance(tools) {
  if (!tools || tools.length === 0) return '';
  const list = tools.join(', ');
  const allTools = ['Read', 'Write', 'Edit', 'MultiEdit', 'Bash', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];
  const forbidden = allTools.filter(t => !tools.includes(t));
  return `> **Tool whitelist (B-α natural-language guidance only — Codex does not enforce per-agent tools)**: You may only use ${list}. Do not run ${forbidden.join(', ') || 'other tools'}.\n`;
}

// Plan-Patch-10 (deep-review C6): inline array + multi-line YAML list 양쪽 처리.
export function parseFrontmatterTools(frontmatter) {
  const inline = frontmatter.match(/^tools\s*:\s*\[([^\]]+)\]/m);
  if (inline) return inline[1].split(',').map(s => s.trim()).filter(Boolean);

  // 들여쓰기 있는 - 항목만 매칭 (closing `---` separator 회피).
  const block = frontmatter.match(/^tools\s*:\s*\n((?:\s+-\s+\S.+\n?)+)/m);
  if (block) {
    return block[1]
      .split('\n')
      .map(l => l.replace(/^\s+-\s+/, '').trim())
      .filter(Boolean);
  }

  return null;
}

function parseFrontmatterModel(frontmatter) {
  const m = frontmatter.match(/^model\s*:\s*([\w-]+)/m);
  if (!m) return null;
  return m[1];
}

const MODEL_DEMOTE_NOTE = `\n> **Note (B-α scope, semantic loss)**: \`model\` frontmatter is information-only. Codex \`spawn_agent\` does not support per-call model override — all workers use the Codex default model. \`model_routing\` field is preserved for future v0.2+ support but does not change runtime behavior.\n`;

export function transformAgentFile(src) {
  const { frontmatter, body } = splitFrontmatter(src);
  const tools = parseFrontmatterTools(frontmatter);
  const model = parseFrontmatterModel(frontmatter);

  let outBody = transformSkillBody(body, '__agent__');

  if (tools && !outBody.includes('Tool whitelist (B-α natural-language guidance only')) {
    outBody = extractToolWhitelistGuidance(tools) + outBody;
  }
  if (model && !outBody.includes('Codex spawn_agent does not support per-call model override') && !outBody.includes('information-only')) {
    outBody = MODEL_DEMOTE_NOTE + outBody;
  }
  return frontmatter + outBody;
}

export function generateOpenaiYaml(agentNames) {
  const lines = [
    '# agents/openai.yaml — Codex agent metadata (figma pattern).',
    '# B-α scope: per-agent tool whitelist NOT enforced by Codex.',
    '# Tool guidance lives in agents/*.md body as natural-language.',
    '',
    'agents:',
  ];
  for (const name of agentNames) {
    lines.push(`  - name: ${name}`);
    lines.push(`    display_name: "${name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}"`);
    lines.push(`    default_prompt: "Execute the task per agents/${name}.md exactly. Output only the structured response specified there."`);
  }
  return lines.join('\n') + '\n';
}

function processAgentFile(srcFile, dstFile, force) {
  const content = fs.readFileSync(srcFile, 'utf8');
  if (!force && fs.existsSync(dstFile) && isMigrated(fs.readFileSync(dstFile, 'utf8'))) {
    return { skipped: true };
  }
  let transformed = transformAgentFile(content);
  if (!isMigrated(transformed)) {
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

  const agentsRoot = path.join(vendor, 'agents');
  if (!fs.existsSync(agentsRoot)) {
    console.error(`migrate-agents: vendor agents/ not found`);
    process.exit(1);
  }

  const names = [];
  let total = 0, written = 0, skipped = 0;
  for (const f of fs.readdirSync(agentsRoot)) {
    if (!f.endsWith('.md')) continue;
    const srcFile = path.join(agentsRoot, f);
    const dstFile = path.join(target, 'agents', f);
    total++;
    const r = processAgentFile(srcFile, dstFile, force);
    if (r.skipped) skipped++; else written++;
    names.push(f.replace(/\.md$/, ''));
  }

  const yamlPath = path.join(target, 'agents/openai.yaml');
  if (force || !fs.existsSync(yamlPath)) {
    fs.mkdirSync(path.dirname(yamlPath), { recursive: true });
    fs.writeFileSync(yamlPath, generateOpenaiYaml(names));
  }
  console.error(`migrate-agents: total=${total} written=${written} skipped=${skipped} + openai.yaml`);
}
