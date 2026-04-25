// transformers.test.mjs — Plan-Patch-11 TDD
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isMigrated, withMarker, MIGRATION_MARKERS, MIGRATION_MARKER,
} from './transformers.mjs';

describe('transformers MIGRATION_MARKERS', () => {
  it('exports md/sh/js variants', () => {
    assert.ok(MIGRATION_MARKERS.md.includes('migrated-by'));
    assert.ok(MIGRATION_MARKERS.sh.includes('migrated-by'));
    assert.ok(MIGRATION_MARKERS.js.includes('migrated-by'));
  });

  it('keeps MIGRATION_MARKER (legacy alias) pointing to .md form for backward compat', () => {
    assert.equal(MIGRATION_MARKER, MIGRATION_MARKERS.md);
  });

  it('isMigrated detects md form', () => {
    assert.equal(isMigrated('<!-- migrated-by: codex-migrate v0.1 -->\n# x'), true);
  });

  it('isMigrated detects sh form (the bug case)', () => {
    assert.equal(isMigrated('# migrated-by: codex-migrate v0.1\n#!/usr/bin/env bash'), true);
  });

  it('isMigrated detects js form', () => {
    assert.equal(isMigrated('// migrated-by: codex-migrate v0.1\nimport fs from "fs";'), true);
  });

  it('isMigrated returns false for non-migrated content', () => {
    assert.equal(isMigrated('# just a header'), false);
  });

  it('withMarker by ext: sh prepends # comment', () => {
    const out = withMarker('echo hi', 'sh');
    assert.match(out, /^# migrated-by: codex-migrate v0\.1\n/);
  });

  it('withMarker by ext: js prepends // comment', () => {
    const out = withMarker('console.log(1);', 'js');
    assert.match(out, /^\/\/ migrated-by: codex-migrate v0\.1\n/);
  });

  it('withMarker by ext: md prepends HTML comment', () => {
    const out = withMarker('# Header', 'md');
    assert.match(out, /^<!-- migrated-by: codex-migrate v0\.1 -->\n/);
  });

  it('withMarker is idempotent (no double-injection)', () => {
    const once = withMarker('echo hi', 'sh');
    const twice = withMarker(once, 'sh');
    assert.equal(once, twice);
  });

  // Plan-Patch-17 (deep-review v3-round C5): shebang 보존
  it('withMarker preserves shebang on first line for sh files', () => {
    const src = `#!/usr/bin/env bash\nset -e\necho hi`;
    const out = withMarker(src, 'sh');
    assert.match(out, /^#!\/usr\/bin\/env bash\n/, 'shebang must remain first line');
    assert.match(out, /^#!\/usr\/bin\/env bash\n# migrated-by: codex-migrate v0\.1\n/);
  });

  it('withMarker preserves shebang on first line for js files', () => {
    const src = `#!/usr/bin/env node\nimport fs from 'fs';`;
    const out = withMarker(src, 'js');
    assert.match(out, /^#!\/usr\/bin\/env node\n/);
    assert.match(out, /^#!\/usr\/bin\/env node\n\/\/ migrated-by: codex-migrate v0\.1\n/);
  });
});
