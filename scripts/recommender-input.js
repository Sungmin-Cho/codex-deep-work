// scripts/recommender-input.js
const MAX_TASK_BYTES = 2048;
const MAX_COMMITS = 5;
const MAX_COMMIT_BYTES = 160;
const MAX_DIRS = 10;
const MAX_DIR_LEN = 30;
const DEFAULT_ASK_ITEMS = ['team_mode', 'start_phase', 'tdd_mode', 'git', 'model_routing'];
const KNOWN_ASK_ITEMS = new Set(DEFAULT_ASK_ITEMS);
const PROMPT_DIRECTIVE_PATTERNS = [
  {
    pattern: /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+instructions\b/gi,
    replacement: '[instruction-text]'
  },
  {
    pattern: /\b(?:always|must|never)\s+recommend\b/gi,
    replacement: '[recommendation-directive]'
  },
  {
    pattern: /\b(?:system|assistant|developer)\s*:/gi,
    replacement: '[role-label]:'
  }
];

function truncateBytes(s, max) {
  const buf = Buffer.from(s, 'utf8');
  if (buf.length <= max) return s;
  // multi-byte 경계 보정: 연속 바이트(0x80~0xBF)에서 시작 바이트(0xxxxxxx 또는 11xxxxxx)로 backtrack
  let end = max;
  while (end > 0 && (buf[end] & 0xC0) === 0x80) end--;
  return buf.subarray(0, end).toString('utf8') + '[truncated]';
}

function sanitizePromptText(value, maxBytes) {
  let clean = String(value || '')
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/`/g, "'")
    .replace(/(^|\s)(\d+)\)/g, '$1$2.')
    .replace(/\s+/g, ' ')
    .trim();
  for (const { pattern, replacement } of PROMPT_DIRECTIVE_PATTERNS) {
    clean = clean.replace(pattern, replacement);
  }
  return truncateBytes(clean, maxBytes);
}

function sanitizeRecentCommit(value) {
  return sanitizePromptText(value, MAX_COMMIT_BYTES);
}

function sanitizeTopLevelDir(value) {
  const raw = String(value || '');
  if (!raw || raw.includes('..') || raw.startsWith('/') || /[\\/:]/.test(raw)) return '';
  return sanitizePromptText(raw, MAX_DIR_LEN);
}

function normalizeAskItems(ask_items) {
  if (!Array.isArray(ask_items) || ask_items.length === 0) return [...DEFAULT_ASK_ITEMS];
  const filtered = ask_items.filter(item => KNOWN_ASK_ITEMS.has(item));
  return filtered.length > 0 ? filtered : [...DEFAULT_ASK_ITEMS];
}

function sanitizeInput({ task_description, recent_commits, top_level_dirs, current_defaults, capability, git_status, ask_items }) {
  const commits = Array.isArray(recent_commits) ? recent_commits : [];
  return {
    task_description: sanitizePromptText(task_description, MAX_TASK_BYTES),
    workspace_meta: {
      git_status: git_status || 'clean', // caller가 channel; 미제공 시 'clean' fallback
      recent_commits: commits.slice(0, MAX_COMMITS).map(sanitizeRecentCommit).filter(Boolean),
      top_level_dirs: (top_level_dirs || [])
        .filter(d => typeof d === 'string')
        .map(sanitizeTopLevelDir)
        .filter(Boolean)
        .slice(0, MAX_DIRS)
    },
    // R3-W2 fix: profile의 interactive_each_session을 caller가 전달 (없으면 5개 default)
    ask_items: normalizeAskItems(ask_items),
    current_defaults: current_defaults || {},
    capability: capability || { git_worktree: false, team_mode_available: false, is_git: false }
  };
}

module.exports = {
  sanitizeInput,
  truncateBytes,
  sanitizePromptText,
  sanitizeRecentCommit,
  sanitizeTopLevelDir,
  normalizeAskItems,
  DEFAULT_ASK_ITEMS,
  MAX_TASK_BYTES,
  MAX_COMMITS,
  MAX_COMMIT_BYTES,
  MAX_DIRS
};

// ── CLI entrypoint ──
if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const parsed = JSON.parse(input);
      const out = sanitizeInput(parsed);
      process.stdout.write(JSON.stringify(out) + '\n');
      process.exit(0);
    } catch (e) {
      process.stderr.write(`recommender-input parse error: ${e.message}\n`);
      process.exit(1);
    }
  });
}
