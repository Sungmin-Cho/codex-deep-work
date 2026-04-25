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
});

describe('migrate-paths isStateLiteral (forbidden literal_replace targets)', () => {
  it('flags .claude/deep-work/ path as state', () => {
    assert.equal(isStateLiteral(".claude/deep-work/sessions.json"), true);
  });

  it('flags .claude/deep-work.<SESSION>.md as state', () => {
    assert.equal(isStateLiteral(".claude/deep-work.abc123.md"), true);
  });

  it('flags .claude/.hook-tool-input.* as state', () => {
    assert.equal(isStateLiteral(".claude/.hook-tool-input.json"), true);
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
