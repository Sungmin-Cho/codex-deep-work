// migrate-paths.test.mjs — Task 2 TDD (non-state literal codemod)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyLiteralReplace, isStateLiteral } from './migrate-paths.mjs';

describe('migrate-paths literal_replace', () => {
  it('replaces claude-deep-work with codex-deep-work', () => {
    const src = `const repo = 'claude-deep-work';`;
    const out = applyLiteralReplace(src);
    assert.ok(out.includes('codex-deep-work'));
    assert.ok(!out.includes('claude-deep-work'));
  });

  it('replaces ~/.claude/plugins/cache with ~/.codex/plugins/cache', () => {
    const src = `const cache = '~/.claude/plugins/cache';`;
    const out = applyLiteralReplace(src);
    assert.ok(out.includes('~/.codex/plugins/cache'));
  });

  it('replaces $HOME/.claude/plugins/cache', () => {
    const src = `const cache = "$HOME/.claude/plugins/cache";`;
    const out = applyLiteralReplace(src);
    assert.ok(out.includes('$HOME/.codex/plugins/cache'));
  });

  it('replaces CLAUDE.md with AGENTS.md', () => {
    const src = `// see CLAUDE.md for context`;
    const out = applyLiteralReplace(src);
    assert.ok(out.includes('AGENTS.md'));
    assert.ok(!out.includes('CLAUDE.md'));
  });

  // 7차 W4: vendor hooks 의 plugin cache path 변환 (state 가 아님).
  it('replaces .claude/.hook-tool-input with .codex/.hook-tool-input (7차 W4)', () => {
    const src = `_HOOK_INPUT_CACHE="$PROJECT_ROOT/.claude/.hook-tool-input.\${PPID}"`;
    const out = applyLiteralReplace(src);
    assert.ok(out.includes('.codex/.hook-tool-input.${PPID}'));
    assert.ok(!out.includes('.claude/.hook-tool-input'));
  });

  it('replaces .claude/.phase-cache- with .codex/.phase-cache- (7차 W4)', () => {
    const src = `PHASE_CACHE="$PROJECT_ROOT/.claude/.phase-cache-\${SESSION_ID}"`;
    const out = applyLiteralReplace(src);
    assert.ok(out.includes('.codex/.phase-cache-${SESSION_ID}'));
    assert.ok(!out.includes('.claude/.phase-cache-'));
  });

  // /deep-review 2026-04-26 C1 fix: narrow mapping (assignment + find context).
  // 이전 broad mapping 은 marker check `[[ -d "$PROJECT_ROOT/.claude" ]]` 까지 변환 → dual-search 손실.
  it('narrow `=$PROJECT_ROOT/.claude"` mapping converts CACHE_DIR + find but NOT marker (C1 fix)', () => {
    const src = `CACHE_DIR="$PROJECT_ROOT/.claude"\nfind "$PROJECT_ROOT/.claude" -maxdepth 1\n[[ -d "$PROJECT_ROOT/.claude" ]] && echo legacy`;
    const out = applyLiteralReplace(src);
    // 변환 대상
    assert.ok(out.includes('CACHE_DIR="$PROJECT_ROOT/.codex"'),
      'assignment context (=") should be migrated');
    assert.ok(out.includes('find "$PROJECT_ROOT/.codex"'),
      'find context should be migrated');
    // 보존 대상 — marker 는 applyStatePathReplace 의 dual-search 가 별도 처리
    assert.ok(out.includes('[[ -d "$PROJECT_ROOT/.claude" ]]'),
      'marker check `[[ -d ... ]]` must NOT be touched by literal_replace (dual-search 가 별도 처리)');
  });
});

describe('migrate-paths isStateLiteral (forbidden literal_replace targets)', () => {
  it('flags .claude/deep-work/ path as state', () => {
    assert.equal(isStateLiteral(".claude/deep-work/sessions.json"), true);
  });

  it('flags .claude/deep-work.<SESSION>.md as state', () => {
    assert.equal(isStateLiteral(".claude/deep-work.abc123.md"), true);
  });

  // 7차 W4: `.claude/.hook-tool-input` 는 state 가 아닌 plugin cache — literal_replace 로 처리.
  it('does NOT flag .claude/.hook-tool-input.* as state (plugin cache, 7차 W4)', () => {
    assert.equal(isStateLiteral(".claude/.hook-tool-input.json"), false);
  });

  // 7차 W4: `.claude/.phase-cache-` 도 마찬가지로 plugin cache.
  it('does NOT flag .claude/.phase-cache-* as state (plugin cache, 7차 W4)', () => {
    assert.equal(isStateLiteral(".claude/.phase-cache-abc"), false);
  });

  it('does NOT flag ~/.claude/plugins/cache as state (non-state HOME path)', () => {
    assert.equal(isStateLiteral("~/.claude/plugins/cache"), false);
  });

  it('does NOT flag claude-deep-work as state', () => {
    assert.equal(isStateLiteral("claude-deep-work"), false);
  });
});

describe('migrate-paths idempotency', () => {
  it('skips files with migration marker', () => {
    const marked = `// <!-- migrated-by: codex-migrate v0.1 -->\nconst x = 'claude-deep-work';`;
    const out = applyLiteralReplace(marked);
    // marker 가 있어도 content 변환 자체는 멱등 — 두 번 적용해도 동일
    const twice = applyLiteralReplace(out);
    assert.equal(out, twice);
  });
});
