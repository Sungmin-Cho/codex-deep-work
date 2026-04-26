// migrated-by: codex-migrate v0.1
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, 'file-tracker.sh');
const UTILS = path.resolve(__dirname, 'utils.sh');

describe('file-tracker.sh v6.2.4 post-review: cache happens BEFORE phase check', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-c3a-'));
    // 7차 W4: cache는 .codex/, legacy state file 은 .claude/ (read_state_file fallback 검증).
    fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.codex'), { recursive: true });
  });
  afterEach(() => { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

  function writeState(sid, phase) {
    const sp = path.join(tmpDir, '.claude', `deep-work.${sid}.md`);
    fs.writeFileSync(sp, `---\ncurrent_phase: ${phase}\n---\n`);
    fs.writeFileSync(path.join(tmpDir, '.claude', 'deep-work-current-session'), sid);
    return sp;
  }

  for (const phase of ['research', 'plan', 'test', 'idle']) {
    it(`caches stdin even when current_phase=${phase} (was missing pre-fix)`, () => {
      const sid = `s-c3a-${phase}`;
      const statePath = writeState(sid, phase);
      const env = {
        ...process.env,
        CLAUDE_TOOL_USE_TOOL_NAME: 'Write',
        DEEP_WORK_SESSION_ID: sid,
      };
      const toolInput = JSON.stringify({ file_path: statePath });
      const result = spawnSync('bash', [SCRIPT], {
        input: toolInput, cwd: tmpDir, env, encoding: 'utf8', timeout: 5000,
      });
      assert.equal(result.status, 0, `hook failed: ${result.stderr}`);

      // 7차 W4: file-tracker.sh 가 .codex/.hook-tool-input.${PPID} 에 쓴다 (이전 .claude/).
      const cacheFile = path.join(tmpDir, '.codex', `.hook-tool-input.${process.pid}`);
      assert.ok(fs.existsSync(cacheFile),
        `cache file missing for phase=${phase}. dir contents: ${fs.readdirSync(path.join(tmpDir, '.codex'))}`);
      assert.equal(fs.readFileSync(cacheFile, 'utf8'), toolInput);
    });
  }
});

describe('file-tracker.sh v6.2.4 post-review: marker flip is lock-guarded', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-c1-'));
    fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true });
  });
  afterEach(() => { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('skips marker flip when ${STATE_FILE}.lock is already held (was unsynchronized pre-fix)', () => {
    const sid = 's-c1';
    const statePath = path.join(tmpDir, '.claude', `deep-work.${sid}.md`);
    fs.writeFileSync(
      statePath,
      '---\ncurrent_phase: implement\nwork_dir: .deep-work/wd\nactive_slice: SLICE-001\nsensor_cache_valid: true\n---\n'
    );
    fs.writeFileSync(path.join(tmpDir, '.claude', 'deep-work-current-session'), sid);
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"x"}');

    // Hold the state-file lock externally to simulate sensor-trigger.js mid-write.
    const lockPath = `${statePath}.lock`;
    fs.mkdirSync(lockPath);

    const env = {
      ...process.env,
      CLAUDE_TOOL_USE_TOOL_NAME: 'Write',
      DEEP_WORK_SESSION_ID: sid,
    };
    const result = spawnSync('bash', [SCRIPT], {
      input: JSON.stringify({ file_path: path.join(tmpDir, 'package.json') }),
      cwd: tmpDir, env, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 0, `hook failed: ${result.stderr}`);

    // Because we held the lock for longer than retry budget (20 × 0.05s = 1s),
    // file-tracker must NOT have flipped sensor_cache_valid (stayed true).
    const content = fs.readFileSync(statePath, 'utf8');
    assert.match(content, /sensor_cache_valid:\s*true/,
      `expected true (lock held), got:\n${content}`);

    // Lock dir must still exist (not force-removed).
    assert.ok(fs.existsSync(lockPath), 'external lock must not be force-removed');

    // Cleanup
    fs.rmdirSync(lockPath);
  });

  it('flips sensor_cache_valid when lock is free (normal case)', () => {
    const sid = 's-c1-ok';
    const statePath = path.join(tmpDir, '.claude', `deep-work.${sid}.md`);
    fs.writeFileSync(
      statePath,
      '---\ncurrent_phase: implement\nwork_dir: .deep-work/wd\nsensor_cache_valid: true\n---\n'
    );
    fs.writeFileSync(path.join(tmpDir, '.claude', 'deep-work-current-session'), sid);
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"x"}');

    const env = {
      ...process.env,
      CLAUDE_TOOL_USE_TOOL_NAME: 'Write',
      DEEP_WORK_SESSION_ID: sid,
    };
    spawnSync('bash', [SCRIPT], {
      input: JSON.stringify({ file_path: path.join(tmpDir, 'package.json') }),
      cwd: tmpDir, env, encoding: 'utf8', timeout: 5000,
    });

    const content = fs.readFileSync(statePath, 'utf8');
    assert.match(content, /sensor_cache_valid:\s*false/,
      `expected false after flip, got:\n${content}`);

    // Lock dir must be released (cleaned up).
    assert.equal(fs.existsSync(`${statePath}.lock`), false, 'lock must be released');
  });
});

describe('file-tracker.sh v6.2.4 post-review: cache write is atomic (tmp+mv)', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-w3-'));
    // /deep-review 2026-04-26 C2: cache 는 .codex/, legacy state file 은 .claude/.
    // 이전엔 .claude/ 만 만들고 거기에서 stray tmp 확인 → production 이 .codex/ 에 쓰므로
    // assertion 이 vacuous green (검사 디렉토리에 tmp 가 없으니 항상 통과). C2 fix.
    fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.codex'), { recursive: true });
  });
  afterEach(() => { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('after run, no stray .tmp.* files remain in .codex/ (C2 fix — was vacuous .claude/)', () => {
    const sid = 's-w3';
    const statePath = path.join(tmpDir, '.claude', `deep-work.${sid}.md`);
    fs.writeFileSync(statePath, '---\ncurrent_phase: implement\nwork_dir: .deep-work/wd\nactive_slice: SLICE-001\n---\n');
    fs.writeFileSync(path.join(tmpDir, '.claude', 'deep-work-current-session'), sid);
    fs.writeFileSync(path.join(tmpDir, 'a.js'), '// x');

    const env = {
      ...process.env,
      CLAUDE_TOOL_USE_TOOL_NAME: 'Write',
      DEEP_WORK_SESSION_ID: sid,
    };
    spawnSync('bash', [SCRIPT], {
      input: JSON.stringify({ file_path: path.join(tmpDir, 'a.js') }),
      cwd: tmpDir, env, encoding: 'utf8', timeout: 5000,
    });

    // production 이 cache 를 .codex/.hook-tool-input.* 에 쓴다. tmp+mv atomic 검증은 .codex/ 디렉토리에서.
    const stray = fs.readdirSync(path.join(tmpDir, '.codex'))
      .filter(n => n.startsWith('.hook-tool-input.') && n.includes('.tmp.'));
    assert.deepEqual(stray, [], `stray tmp files: ${JSON.stringify(stray)}`);
  });
});
