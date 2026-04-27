// migrate-commands.test.mjs — Task 4 TDD
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transformCommandFile, splitFrontmatter } from './migrate-commands.mjs';

describe('migrate-commands frontmatter migration', () => {
  it('preserves YAML metadata while converting Claude tool frontmatter to Codex capabilities', () => {
    const src = `---\nname: deep-work\nallowed-tools: Skill, Read, Write, Bash, Agent, AskUserQuestion, update_plan\ndescription: foo\n---\n\nUse the Task tool.`;
    const out = transformCommandFile(src);
    const { frontmatter } = splitFrontmatter(out);
    assert.match(frontmatter, /name:\s*deep-work/);
    assert.match(frontmatter, /description:\s*foo/);
    assert.doesNotMatch(frontmatter, /allowed-tools/);
    assert.match(frontmatter, /codex-capabilities:/);
    assert.match(frontmatter, /skill invocation/);
    assert.match(frontmatter, /workspace-read\/search/);
    assert.match(frontmatter, /apply_patch/);
    assert.match(frontmatter, /exec_command/);
    assert.match(frontmatter, /spawn_agent/);
    assert.match(frontmatter, /numbered-choice prompt/);
  });

  it('handles missing frontmatter gracefully', () => {
    const src = `# deep-work\n\nUse Task.`;
    assert.doesNotThrow(() => transformCommandFile(src));
  });
});

describe('migrate-commands body tool mapping', () => {
  it('applies same tool mapping rules as skills', () => {
    const src = `---\nname: x\n---\n\nUse TaskCreate to plan. Then Task tool with subagent_type=research-codebase-worker.`;
    const out = transformCommandFile(src);
    assert.ok(!/TaskCreate/.test(out));
    assert.ok(!/Task tool/.test(out));
  });

  it('replaces literal claude-deep-work', () => {
    const src = `---\nname: x\n---\n\nThis is for claude-deep-work.`;
    const out = transformCommandFile(src);
    assert.ok(out.includes('codex-deep-work'));
  });
});

describe('migrate-commands idempotency', () => {
  it('is idempotent', () => {
    const src = `---\nname: x\n---\n\nUse TaskCreate.`;
    const once = transformCommandFile(src);
    const twice = transformCommandFile(once);
    assert.equal(once, twice);
  });
});
