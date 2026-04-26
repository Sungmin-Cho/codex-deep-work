// migrate-manifest.test.mjs — Task 1 TDD
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyManifestTransform, applyMergeStrategy } from './migrate-manifest.mjs';

describe('migrate-manifest', () => {
  it('replaces .claude-plugin/ with .codex-plugin/ in files array', () => {
    const cc = {
      name: '@claude-deep-work/deep-work',
      version: '6.4.0',
      files: ['.claude-plugin/', 'commands/', 'skills/', 'hooks/'],
      keywords: ['claude-code', 'claude-code-plugin', 'deep-work', 'workflow', 'agent-team']
    };
    const out = applyManifestTransform(cc);
    assert.ok(out.files.includes('.codex-plugin/'));
    assert.ok(!out.files.includes('.claude-plugin/'));
  });

  it('replaces CLAUDE.md with AGENTS.md', () => {
    const cc = { name: 'x', version: '1', files: ['CLAUDE.md'], keywords: [] };
    const out = applyManifestTransform(cc);
    assert.ok(out.files.includes('AGENTS.md'));
    assert.ok(!out.files.includes('CLAUDE.md'));
  });

  it('adds README.ko.md and CHANGELOG.{md,ko.md}', () => {
    const cc = { name: 'x', version: '1', files: ['.claude-plugin/', 'README.md'], keywords: [] };
    const out = applyManifestTransform(cc);
    assert.ok(out.files.includes('README.ko.md'));
    assert.ok(out.files.includes('CHANGELOG.md'));
    assert.ok(out.files.includes('CHANGELOG.ko.md'));
  });

  it('removes claude-code* keywords and agent-team, adds codex', () => {
    const cc = {
      name: 'x', version: '1', files: [],
      keywords: ['claude-code', 'claude-code-plugin', 'deep-work', 'workflow', 'agent-team']
    };
    const out = applyManifestTransform(cc);
    assert.ok(!out.keywords.includes('claude-code'));
    assert.ok(!out.keywords.includes('claude-code-plugin'));
    assert.ok(!out.keywords.includes('agent-team'));
    assert.ok(out.keywords.includes('codex'));
    assert.ok(out.keywords.includes('deep-work'));
  });

  // 5차 W7: discoverability — description 의 "Evidence-Driven Development Protocol" / "TDD enforcement"
  // 와 일관되게 keywords 에 evidence-driven, tdd 추가 (npm search hit 율).
  it('adds evidence-driven and tdd keywords (5차 W7)', () => {
    const cc = { name: 'x', version: '1', files: [], keywords: [] };
    const out = applyManifestTransform(cc);
    assert.ok(out.keywords.includes('evidence-driven'));
    assert.ok(out.keywords.includes('tdd'));
  });

  // 5차 W7: LICENSE 가 npm tarball 에 자동 포함되긴 하지만 files 배열에도 명시 (explicit > implicit).
  it('adds LICENSE to files array (5차 W7)', () => {
    const cc = { name: 'x', version: '1', files: ['README.md'], keywords: [] };
    const out = applyManifestTransform(cc);
    assert.ok(out.files.includes('LICENSE'));
  });

  it('renames package name from @claude-deep-work/deep-work to codex-deep-work', () => {
    const cc = { name: '@claude-deep-work/deep-work', version: '6.4.0', files: [], keywords: [] };
    const out = applyManifestTransform(cc);
    assert.equal(out.name, 'codex-deep-work');
  });

  it('bumps version to 0.1.0 (codex-deep-work first release)', () => {
    const cc = { name: 'x', version: '6.4.0', files: [], keywords: [] };
    const out = applyManifestTransform(cc);
    assert.equal(out.version, '0.1.0');
  });

  it('is idempotent (running twice yields same output)', () => {
    const cc = { name: '@claude-deep-work/deep-work', version: '6.4.0', files: ['.claude-plugin/'], keywords: ['claude-code'] };
    const once = applyManifestTransform(cc);
    const twice = applyManifestTransform(once);
    assert.deepEqual(once, twice);
  });
});

// Plan-Patch-27 (deep-review v3-라운드 3차 C5): applyMergeStrategy 단위 테스트 — existing 의 추가 필드 보존 검증.
describe('migrate-manifest applyMergeStrategy', () => {
  it('preserves existing.type (e.g., "module")', () => {
    const existing = { name: 'codex-deep-work', version: '0.0.1', files: [], keywords: [], type: 'module' };
    const transformed = { name: 'codex-deep-work', version: '0.1.0', files: [], keywords: [] };
    const out = applyMergeStrategy(existing, transformed);
    assert.equal(out.type, 'module');
  });

  it('preserves existing.devDependencies', () => {
    const existing = { name: 'x', version: '0.0.1', files: [], keywords: [], devDependencies: { eslint: '^9.0.0' } };
    const transformed = { name: 'x', version: '0.1.0', files: [], keywords: [] };
    const out = applyMergeStrategy(existing, transformed);
    assert.deepEqual(out.devDependencies, { eslint: '^9.0.0' });
  });

  it('preserves existing.exports / engines / packageManager', () => {
    const existing = {
      name: 'x', version: '0', files: [], keywords: [],
      exports: { '.': './index.mjs' },
      engines: { node: '>=22' },
      packageManager: 'pnpm@9.0.0',
    };
    const transformed = { name: 'x', version: '0.1.0', files: [], keywords: [] };
    const out = applyMergeStrategy(existing, transformed);
    assert.deepEqual(out.exports, { '.': './index.mjs' });
    assert.deepEqual(out.engines, { node: '>=22' });
    assert.equal(out.packageManager, 'pnpm@9.0.0');
  });

  it('overwrites name/version/files/keywords from transformed', () => {
    const existing = { name: 'old', version: '0.0.1', files: ['old/'], keywords: ['old'] };
    const transformed = { name: 'new', version: '0.1.0', files: ['new/'], keywords: ['new'] };
    const out = applyMergeStrategy(existing, transformed);
    assert.equal(out.name, 'new');
    assert.equal(out.version, '0.1.0');
    assert.deepEqual(out.files, ['new/']);
    assert.deepEqual(out.keywords, ['new']);
  });
});
