// scripts/recommender-parser.js
const ENUMS = {
  team_mode:     ['solo', 'team'],
  start_phase:   ['brainstorm', 'research', 'plan'],
  tdd_mode:      ['strict', 'coaching', 'relaxed', 'spike'],
  git:           ['worktree', 'new-branch', 'current-branch'],
  model_routing: ['default', 'custom']
};
const MAX_REASON_CHARS = 50;
const TOP_LEVEL_KEYS = Object.keys(ENUMS);
const ITEM_KEYS = ['value', 'reason'];

function hasExactKeys(obj, expected) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const actual = Object.keys(obj).sort();
  const wanted = expected.slice().sort();
  return actual.length === wanted.length && wanted.every((key, idx) => key === actual[idx]);
}

function validateReason(reason) {
  if (typeof reason !== 'string') return null;
  const trimmed = reason.trim();
  if (trimmed.length === 0) return null;
  if (/[\x00-\x1F\x7F]/.test(trimmed)) return null;
  if (/`/.test(trimmed)) return null;
  if (/(^|\s)\d+\)/.test(trimmed)) return null;
  if (Array.from(trimmed).length > MAX_REASON_CHARS) return null;
  return trimmed;
}

function parseRecommendation(rawText, ctx = {}) {
  // multi-fence detect — sub-agent system prompt가 "정확히 하나만"을 강제하므로
  // 둘 이상이면 spec violation으로 간주하고 fallback (W16)
  const text = String(rawText).trim();
  const fences = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (fences.length === 0) return { ok: false, fallback_reason: 'no-json-fence' };
  if (fences.length > 1) return { ok: false, fallback_reason: 'multiple-fences' };
  const exactFence = text.match(/^```json\s*([\s\S]*?)```$/);
  if (!exactFence) return { ok: false, fallback_reason: 'surrounding-text' };

  let data;
  try {
    data = JSON.parse(exactFence[1]);
  } catch (e) {
    return { ok: false, fallback_reason: `json-parse-error: ${e.message}` };
  }

  if (!hasExactKeys(data, TOP_LEVEL_KEYS.slice().sort())) {
    return { ok: false, fallback_reason: 'schema violation: top-level keys' };
  }

  // 5-key 완전성 (C8) — partial output silent pass 차단
  for (const key of TOP_LEVEL_KEYS) {
    if (!hasExactKeys(data[key], ITEM_KEYS)) {
      return { ok: false, fallback_reason: `schema violation: ${key}` };
    }
    if (!data[key] || typeof data[key].value !== 'string') {
      return { ok: false, fallback_reason: `missing key: ${key}` };
    }
    const reason = validateReason(data[key].reason);
    if (!reason) {
      return { ok: false, fallback_reason: `invalid reason: ${key}` };
    }
    data[key].reason = reason;
  }

  // enum validation
  for (const [key, allowed] of Object.entries(ENUMS)) {
    if (!allowed.includes(data[key].value)) {
      return { ok: false, fallback_reason: `enum violation: ${key}=${data[key].value}` };
    }
  }

  // capability check (fail-closed: must be explicitly true to allow team/worktree)
  const cap = ctx.capability || {};
  if (cap.team_mode_available !== true && data.team_mode.value === 'team') {
    return { ok: false, fallback_reason: 'capability: team_mode unavailable (or unset)' };
  }
  if (cap.git_worktree !== true && data.git.value === 'worktree') {
    return { ok: false, fallback_reason: 'capability: worktree unavailable (or unset)' };
  }
  if (cap.is_git !== true && data.git.value === 'new-branch') {
    return { ok: false, fallback_reason: 'capability: git repository unavailable (or unset)' };
  }
  return { ok: true, data };
}

module.exports = { parseRecommendation, ENUMS, validateReason, MAX_REASON_CHARS, hasExactKeys };
