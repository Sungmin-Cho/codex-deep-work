#!/usr/bin/env node
// Run only tracked project tests; ignored vendor snapshots are migration inputs,
// not part of the completion gate.

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function trackedFiles() {
  const git = spawnSync('git', ['ls-files'], { encoding: 'utf8' });
  if (git.status === 0) {
    return git.stdout.split('\n').filter(Boolean);
  }
  const out = [];
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      if (['.git', 'node_modules', 'vendor'].includes(name)) continue;
      const p = path.join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk('.');
  return out;
}

const tests = trackedFiles()
  .filter(f => /(?:^|\/).+\.test\.(?:js|mjs)$/.test(f))
  .sort();

const result = spawnSync(process.execPath, ['--test', ...tests], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
