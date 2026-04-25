// migrate-commands.test.mjs — Task 4 TDD
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transformCommandFile, splitFrontmatter } from './migrate-commands.mjs';

describe('migrate-commands frontmatter preservation', () => {
  it('preserves YAML frontmatter unchanged', () => {
    const src = `---\nname: deep-work\ndescription: foo\n---\n\nUse the Task tool.`;
    const out = transformCommandFile(src);
    const { frontmatter } = splitFrontmatter(out);
    assert.match(frontmatter, /name:\s*deep-work/);
    assert.match(frontmatter, /description:\s*foo/);
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
