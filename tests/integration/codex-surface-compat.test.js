const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..');

function trackedFiles() {
  const git = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(git.status, 0, git.stderr);
  return git.stdout.split('\n').filter(Boolean);
}

const RUNTIME_SURFACE = [
  /^AGENTS\.md$/,
  /^README(?:\.ko)?\.md$/,
  /^commands\/.+\.md$/,
  /^skills\/.+\.md$/,
  /^agents\/.+\.md$/,
  /^hooks\/scripts\/(?!.*\.test\.js$).+\.(?:sh|js)$/,
  /^\.codex-plugin\/plugin\.json$/,
  /^package\.json$/,
  /^assumptions\.json$/,
];

const FORBIDDEN = [
  { name: 'Claude command frontmatter', pattern: /^allowed-tools:/m },
  { name: 'Claude plugin root variable', pattern: /\bCLAUDE_PLUGIN_ROOT\b/ },
  { name: 'Claude agent teams env var', pattern: /\bCLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS\b/ },
  { name: 'Claude language setting', pattern: /Claude Code `language` setting/ },
  { name: 'Claude Agent tool instruction', pattern: /Claude Code의 Agent tool|Claude 에이전트|Agent tool/ },
  { name: 'AskUserQuestion runtime instruction', pattern: /\bAskUserQuestion\b/ },
  { name: 'Claude-style tool call form', pattern: /\b(?:Read|Write|Edit|Bash|Grep|Glob)\s*\(/ },
  { name: 'Claude Agent call form', pattern: /\bAgent\s*\(/ },
  { name: 'Claude Team namespace primitive', pattern: /\b(?:TeamCreate|TeamDelete|TeamGet|SendMessage|TaskCreate|TaskUpdate|TaskList|TaskGet|TodoWrite)\b/ },
  { name: 'Claude subagent_type token', pattern: /\bsubagent_type\b/ },
  { name: 'Claude structured prompt schema block', pattern: /번호형 사용자 확인[\s\S]{0,120}^\s*-\s+header:/m },
  { name: 'Claude structured prompt multiSelect', pattern: /^\s*-\s+multiSelect:\s*(?:true|false)\b/m },
  { name: 'Claude tool names in Codex capability metadata', pattern: /^codex-capabilities:.*\b(?:Read|Write|Edit|Bash|Grep|Glob|Agent|Skill)\b/m },
  { name: 'Claude agent tools frontmatter block', pattern: /^tools:\n(?:  - .+\n)+/m },
  { name: 'Claude tool whitelist guidance', pattern: /Tool whitelist|You may only use (?:Read|Grep|Glob|Write|Edit|Bash)/ },
];

function isRuntimeSurface(file) {
  return RUNTIME_SURFACE.some(pattern => pattern.test(file));
}

test('Codex runtime surface does not expose Claude-only execution instructions', () => {
  const failures = [];

  for (const file of trackedFiles().filter(isRuntimeSurface)) {
    const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const { name, pattern } of FORBIDDEN) {
      if (pattern.test(content)) failures.push(`${file}: ${name}`);
    }
  }

  assert.deepEqual(failures, []);
});
