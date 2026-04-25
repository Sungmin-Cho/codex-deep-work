#!/usr/bin/env node
// migrate-skills.mjs — skill body tool/path mapping per spec Section 3-1, 3-3, 3-5, 3-6.
// + Plan-Patch-2: OI-11 First-Run Install Pattern prepended to deep-work-orchestrator.
// <!-- migrated-by: codex-migrate v0.1 -->

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMigrated, MIGRATION_MARKER } from './lib/transformers.mjs';
import { applyLiteralReplace } from './migrate-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOL_MAPPING = JSON.parse(fs.readFileSync(path.join(__dirname, 'lib/tool-mapping.json'), 'utf8'));

const FIRST_RUN_INSTALL_BLOCK = `## First-Run Hook Install Check (OI-11)

Before proceeding, check if \`<repo>/.codex/hooks.json\` exists.

If absent:
1. Display the contents of the plugin's \`hooks/hooks-template.json\` to the user
2. Ask: "deep-work plugin uses Codex hooks for TDD enforcement and receipt validation. Install hooks into <repo>/.codex/hooks.json now?"
3. On Y → merge install (preserving any existing hooks)
4. On N → set \`.codex/deep-work/no-hook-mode\` flag → degrade to natural-language fallback (post-hoc receipt validation)
5. Record decision in \`assumptions.json.first_run_install_completed\`

`;

export function prependFirstRunInstall(body, skillName) {
  if (skillName !== 'deep-work-orchestrator') return body;
  if (body.includes('First-Run Hook Install Check')) return body;
  // SKILL.md 의 frontmatter 가 있으면 frontmatter 다음에, 없으면 첫 줄 위에
  const fm = body.match(/^---\n[\s\S]*?\n---\n/);
  if (fm) {
    return body.slice(0, fm[0].length) + '\n' + FIRST_RUN_INSTALL_BLOCK + body.slice(fm[0].length);
  }
  return FIRST_RUN_INSTALL_BLOCK + body;
}

const PARALLEL_TASK_PATTERN = /Single message with multiple Task calls[^.]*/g;
const PARALLEL_TASK_REPLACEMENT = 'Spawn N worker agents in sequence (multi_agent slot limit allows up to 6 concurrent), then wait N times, close_agent N times';

function applyToolMapping(src) {
  let out = src;

  // 1. rename: TaskCreate/Update/List/Get/TodoWrite
  // call form: Token( ... )
  for (const [tok] of Object.entries(TOOL_MAPPING.rename)) {
    out = out.replace(new RegExp(`\\b${tok}\\s*\\([^)]*\\)`, 'g'), `update_plan with these steps:`);
  }
  // narrative: "Use the TaskCreate tool" → "Update the plan via update_plan"
  for (const [tok] of Object.entries(TOOL_MAPPING.rename)) {
    out = out.replace(new RegExp(`Use the \\*?\\*?${tok}\\*?\\*? tool`, 'g'), `Update the plan via update_plan`);
    out = out.replace(new RegExp(`\\bUse ${tok}\\b`, 'g'), `Update the plan via update_plan`);
    out = out.replace(new RegExp(`\\b${tok}\\s+tool\\b`, 'g'), `update_plan`);
    out = out.replace(new RegExp(`\\b${tok}\\b`, 'g'), `update_plan`);
  }

  // 2. subagent.Task — parallel block 먼저 (single 매칭이 잠식 방지)
  out = out.replace(PARALLEL_TASK_PATTERN, PARALLEL_TASK_REPLACEMENT);
  // single Task — frontmatter/body 자연어. "Use the Task tool with subagent_type=..." 가 가장 구체적.
  out = out.replace(/Use the \*?\*?Task\*?\*? tool with subagent_type=([\w-]+)[^.\n]*/g,
    'Spawn a worker agent (multi_agent) with the contents of agents/$1.md as message');
  // "Task tool with subagent_type=..." — Use the 가 없는 케이스 (then/and 가 앞에)
  out = out.replace(/\bTask\s+tool\s+with\s+subagent_type=([\w-]+)[^.\n]*/g,
    'spawn a worker agent (multi_agent) with the contents of agents/$1.md as message');
  out = out.replace(/the \*?\*?Task\*?\*? tool/g, 'the spawn_agent natural-language dispatch');
  // 잔존 "Task tool" (any preceding word) — 일반 fallback
  out = out.replace(/\bTask\s+tool\b/g, 'spawn_agent dispatch');
  out = out.replace(/\bTask\s*\(\s*subagent_type\s*=\s*["']?([\w-]+)["']?[^)]*\)/g,
    'Spawn a worker agent (multi_agent) with agents/$1.md as message');

  // 3. natural_language_only: Skill / AskUserQuestion / TeamCreate / TeamDelete / TeamGet / SendMessage
  // Skill(...) 의 첫 quoted argument 캡쳐. args= 뒤따르는 케이스도 매칭. 본문 안 백틱 코드는 보존 의도지만,
  // verify check 3 의 grep -vE 가 marker 외 잔존 차단.
  out = out.replace(/Skill\(\s*["']([\w/-]+)["'][^)]*\)/g, 'the $1 skill');
  out = out.replace(/AskUserQuestion\([^)]*\)/g, 'ask the user with numbered options (1) ... 2) ... — 숫자로 응답)');
  out = out.replace(/TeamCreate\([^)]*\)/g, 'Track parallel workers in main session memory (B-α scope: no team namespace)');
  out = out.replace(/TeamDelete\([^)]*\)/g, 'Conclude parallel worker tracking');
  out = out.replace(/TeamGet\([^)]*\)/g, 'Refer to main session memory for worker status');
  // SendMessage — pattern 1/2 분리는 1차 휴리스틱
  out = out.replace(/SendMessage\([^)]*\)/g, (m) => {
    if (/all workers|aggregate|gather/i.test(m)) {
      return 'Aggregate worker results in main session memory (pattern 1: parallel aggregation)';
    }
    return 'Pass the following result to the next worker as message (pattern 2: sequential chain — semantic loss)';
  });

  // 4. NotebookEdit fallback
  out = out.replace(/\bNotebookEdit\b/g, 'Write');

  // 5. AskUserQuestion 본문 narrative
  out = out.replace(/Use the \*?\*?AskUserQuestion\*?\*? tool[^.]*/g,
    'Ask the user a numbered-options question (1) ... 2) ... — 자연어 prompt)');

  return out;
}

export function transformSkillBody(src, skillName) {
  let out = src;
  // 1. literal path replace (non-state)
  out = applyLiteralReplace(out);
  // 2. tool mapping
  out = applyToolMapping(out);
  // 3. first-run install (only deep-work-orchestrator)
  out = prependFirstRunInstall(out, skillName);
  return out;
}

function processSkillFile(srcFile, dstFile, skillName, force) {
  const content = fs.readFileSync(srcFile, 'utf8');
  if (!force && fs.existsSync(dstFile) && isMigrated(fs.readFileSync(dstFile, 'utf8'))) {
    return { skipped: true };
  }
  let transformed = transformSkillBody(content, skillName);
  if (!isMigrated(transformed)) {
    transformed = MIGRATION_MARKER + '\n' + transformed;
  }
  fs.mkdirSync(path.dirname(dstFile), { recursive: true });
  fs.writeFileSync(dstFile, transformed);
  return { written: true };
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const vendor = process.argv[2] || `${process.env.HOME}/Dev/codex-deep-work/vendor/claude-deep-work-v6.4.0`;
  const target = process.argv[3] || `${process.env.HOME}/Dev/codex-deep-work`;
  const force = process.argv.includes('--force');

  const skillsRoot = path.join(vendor, 'skills');
  if (!fs.existsSync(skillsRoot)) {
    console.error(`migrate-skills: vendor skills/ not found at ${skillsRoot}`);
    process.exit(1);
  }

  let total = 0, written = 0, skipped = 0;
  // 8 skill 디렉토리
  for (const ent of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name === 'shared') continue;
    const skillName = ent.name;
    const srcSkill = path.join(skillsRoot, skillName, 'SKILL.md');
    if (fs.existsSync(srcSkill)) {
      const dstSkill = path.join(target, 'skills', skillName, 'SKILL.md');
      total++;
      const r = processSkillFile(srcSkill, dstSkill, skillName, force);
      if (r.skipped) skipped++; else written++;
    }
    // skill 디렉토리 안의 다른 .md / .js / fixtures (deep-integrate 의 경우)
    const skillDir = path.join(skillsRoot, skillName);
    for (const sub of fs.readdirSync(skillDir, { withFileTypes: true })) {
      if (sub.isFile() && sub.name !== 'SKILL.md' && (sub.name.endsWith('.md') || sub.name.endsWith('.js'))) {
        const subSrc = path.join(skillDir, sub.name);
        const subDst = path.join(target, 'skills', skillName, sub.name);
        total++;
        const r = processSkillFile(subSrc, subDst, skillName, force);
        if (r.skipped) skipped++; else written++;
      } else if (sub.isDirectory() && (sub.name === 'fixtures' || sub.name === 'schema')) {
        // 재귀 1단계만 (fixture / schema 하위)
        const subDir = path.join(skillDir, sub.name);
        for (const f of fs.readdirSync(subDir)) {
          const fSrc = path.join(subDir, f);
          if (fs.statSync(fSrc).isFile()) {
            const fDst = path.join(target, 'skills', skillName, sub.name, f);
            total++;
            const r = processSkillFile(fSrc, fDst, skillName, force);
            if (r.skipped) skipped++; else written++;
          }
        }
      }
    }
  }
  // shared/references + shared/templates
  for (const sub of ['references', 'templates']) {
    const sharedSub = path.join(skillsRoot, 'shared', sub);
    if (!fs.existsSync(sharedSub)) continue;
    for (const f of fs.readdirSync(sharedSub)) {
      const fSrc = path.join(sharedSub, f);
      if (fs.statSync(fSrc).isFile()) {
        const fDst = path.join(target, 'skills', 'shared', sub, f);
        total++;
        const r = processSkillFile(fSrc, fDst, 'shared', force);
        if (r.skipped) skipped++; else written++;
      }
    }
  }
  console.error(`migrate-skills: total=${total} written=${written} skipped=${skipped}`);
}
