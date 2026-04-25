// migrate-fixtures.test.mjs — Task 6 TDD
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { convertEnvFixtureToStdin } from './migrate-fixtures.mjs';

describe('migrate-fixtures convertEnvFixtureToStdin (Plan-Patch-9 — 5종 변수)', () => {
  it('replaces CLAUDE_TOOL_USE_TOOL_NAME env in execFileSync with stdin input', () => {
    const src = `execFileSync(script, [], { env: { ...process.env, CLAUDE_TOOL_USE_TOOL_NAME: 'Write', CLAUDE_TOOL_USE_TOOL_INPUT: JSON.stringify({file_path:'a.md'}) } });`;
    const out = convertEnvFixtureToStdin(src);
    assert.match(out, /input:\s*JSON\.stringify\(/);
    assert.match(out, /tool_name:\s*['"]Write['"]/);
    assert.ok(!/CLAUDE_TOOL_USE_TOOL_NAME/.test(out));
  });

  it('handles CLAUDE_TOOL_NAME (no _USE_) variant', () => {
    const src = `execFileSync(script, [], { env: { ...process.env, CLAUDE_TOOL_NAME: 'Edit' } });`;
    const out = convertEnvFixtureToStdin(src);
    assert.match(out, /tool_name:\s*['"]Edit['"]/);
    assert.ok(!/CLAUDE_TOOL_NAME/.test(out));
  });

  it('handles CLAUDE_TOOL_INPUT (no _USE_) variant', () => {
    const src = `execFileSync(script, [], { env: { ...process.env, CLAUDE_TOOL_NAME: 'Write', CLAUDE_TOOL_INPUT: JSON.stringify({x:1}) } });`;
    const out = convertEnvFixtureToStdin(src);
    assert.match(out, /tool_input:\s*JSON\.stringify/);
    assert.ok(!/CLAUDE_TOOL_INPUT/.test(out));
  });

  it('handles CLAUDE_TOOL_USE_INPUT (intermediate) variant', () => {
    const src = `execFileSync(script, [], { env: { ...process.env, CLAUDE_TOOL_USE_TOOL_NAME: 'Write', CLAUDE_TOOL_USE_INPUT: JSON.stringify({x:1}) } });`;
    const out = convertEnvFixtureToStdin(src);
    assert.match(out, /tool_input:\s*JSON\.stringify/);
    assert.ok(!/CLAUDE_TOOL_USE_INPUT/.test(out));
  });

  it('preserves other env vars (e.g., DEEP_WORK_SESSION)', () => {
    const src = `execFileSync(script, [], { env: { ...process.env, CLAUDE_TOOL_USE_TOOL_NAME: 'Write', DEEP_WORK_SESSION: 'abc' } });`;
    const out = convertEnvFixtureToStdin(src);
    assert.match(out, /DEEP_WORK_SESSION/);
  });

  it('handles multi-line env objects', () => {
    const src = `execFileSync(script, [], {
      env: {
        ...process.env,
        CLAUDE_TOOL_USE_TOOL_NAME: 'Edit',
        CLAUDE_TOOL_USE_TOOL_INPUT: JSON.stringify({a: 1}),
      },
    });`;
    const out = convertEnvFixtureToStdin(src);
    assert.match(out, /tool_name:\s*['"]Edit['"]/);
    assert.match(out, /input:/);
  });

  it('priority: tool_name first match wins (CLAUDE_TOOL_USE_TOOL_NAME > CLAUDE_TOOL_NAME)', () => {
    const src = `{ env: { CLAUDE_TOOL_USE_TOOL_NAME: 'A', CLAUDE_TOOL_NAME: 'B' } }`;
    const out = convertEnvFixtureToStdin(src);
    assert.match(out, /tool_name:\s*['"]A['"]/);
    assert.ok(!out.includes("'B'"));
  });

  it('is idempotent', () => {
    const src = `execFileSync(script, [], { env: { ...process.env, CLAUDE_TOOL_USE_TOOL_NAME: 'Write' } });`;
    const once = convertEnvFixtureToStdin(src);
    const twice = convertEnvFixtureToStdin(once);
    assert.equal(once, twice);
  });

  // Plan-Patch-22 (deep-review v3-round C3): multi-level nesting fallback
  it('emits Phase-C TODO marker on 3-level nested JSON.stringify (manual review required)', () => {
    const src = `execFileSync(script, [], {
      env: {
        ...process.env,
        CLAUDE_TOOL_USE_TOOL_INPUT: JSON.stringify({
          file_path: 'a.md',
          edits: [{ from: 'x', to: 'y' }],
        }),
      },
    });`;
    const out = convertEnvFixtureToStdin(src);
    assert.match(out, /TODO\(Phase-C\): multi-level nesting/);
    // 자동 변환 skip — 원래 fixture 보존
    assert.match(out, /CLAUDE_TOOL_USE_TOOL_INPUT/);
  });

  it('still converts 2-level (single-level JSON.stringify object) automatically', () => {
    const src = `execFileSync(script, [], { env: { ...process.env, CLAUDE_TOOL_USE_TOOL_INPUT: JSON.stringify({ file_path: 'a.md' }) } });`;
    const out = convertEnvFixtureToStdin(src);
    assert.match(out, /input:\s*JSON\.stringify/);
    assert.ok(!/TODO\(Phase-C\)/.test(out));
  });
});
