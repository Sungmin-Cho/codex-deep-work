// migrated-by: codex-migrate v0.1
// 부록 F #9 (Phase C 2026-04-26): multi-level nesting fixture 마이그레이션 완료.
// CC era 의 `CLAUDE_TOOL_USE_INPUT` env-var fixture (single-level `{file_path}`) 를
// Codex envelope (`{tool_name, tool_input: {file_path}, hook_event_name}`) 으로 변환.
// 단 phase-transition.sh 는 PostToolUse 에서 stdin 이 비어있을 가능성 (file-tracker 가
// 먼저 소진) → CLAUDE_TOOL_USE_INPUT env 또는 cache 에서 읽음. 따라서 두 사이트 분리:
//   - PreToolUse 시뮬레이션 → stdin envelope 전달
//   - PostToolUse 후속 phase-transition.sh → env-var 또는 cache file fallback (vendor 동작)
// parse_hook_stdin 가 envelope 파싱 후 5 backward-compat env aliases (CLAUDE_TOOL_USE_INPUT
// 포함) 를 export 하므로 양쪽 호환.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const HOOKS = path.resolve(__dirname);

function envelope(toolName, toolInput, event = 'PreToolUse') {
  return JSON.stringify({
    tool_name: toolName,
    tool_input: toolInput,
    hook_event_name: event,
  });
}

describe('e2e: file_path with escaped quotes does not break hooks', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ip-e2e-'));
    fs.mkdirSync(path.join(tmpDir, '.codex'), { recursive: true });
  });
  afterEach(() => { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('phase-guard.sh: escaped-quote path is parsed correctly (no spurious block)', () => {
    const sid = 's-esc1';
    // current_phase=research means Write outside worktree normally blocks; but
    // this test sets worktree disabled + phase=idle to isolate the parsing check:
    // if parsing works, no file_path-based block logic fires; if parsing is broken
    // (grep truncates at \"), the fallback behavior may differ.
    const statePath = path.join(tmpDir, '.codex', `deep-work.${sid}.md`);
    fs.writeFileSync(statePath, '---\ncurrent_phase: idle\n---\n');
    fs.writeFileSync(path.join(tmpDir, '.codex', 'deep-work-current-session'), sid);

    const filePath = path.join(tmpDir, 'a "b" c.txt');
    const result = spawnSync('bash', [path.join(HOOKS, 'phase-guard.sh')], {
      input: envelope('Write', { file_path: filePath }),
      cwd: tmpDir,
      env: { ...process.env, DEEP_WORK_SESSION_ID: sid },
      encoding: 'utf8',
      timeout: 5000,
    });

    // idle phase → always exit 0 (allow). No block reason.
    assert.equal(result.status, 0, `unexpected non-zero exit: ${result.stdout} ${result.stderr}`);
    assert.equal(result.stdout.trim(), '');
  });

  it('phase-guard.sh: block message is valid JSON even when path contains quotes', () => {
    const sid = 's-esc2';
    // Setup: current_phase=research (non-implement) + a file_path with quotes
    // should block AND produce a parseable JSON block message.
    const statePath = path.join(tmpDir, '.codex', `deep-work.${sid}.md`);
    fs.writeFileSync(statePath, '---\ncurrent_phase: research\nwork_dir: .deep-work/test\n---\n');
    fs.writeFileSync(path.join(tmpDir, '.codex', 'deep-work-current-session'), sid);

    const filePath = path.join(tmpDir, 'src with "quotes".js');
    const result = spawnSync('bash', [path.join(HOOKS, 'phase-guard.sh')], {
      input: envelope('Write', { file_path: filePath }),
      cwd: tmpDir,
      env: { ...process.env, DEEP_WORK_SESSION_ID: sid },
      encoding: 'utf8',
      timeout: 5000,
    });

    assert.equal(result.status, 2, `expected block (exit 2), got ${result.status}: ${result.stdout} ${result.stderr}`);
    // stdout must be a valid JSON object
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(result.stdout.trim()); }, `block message not valid JSON:\n${result.stdout}`);
    assert.equal(parsed.decision, 'block');
    // The file path (unescaped) must appear in the reason
    assert.ok(parsed.reason.includes(filePath), `reason should contain the file path unchanged, got:\n${parsed.reason}`);
  });

  it('file-tracker.sh: escaped-quote path is recorded in receipt verbatim', () => {
    const sid = 's-esc3';
    const statePath = path.join(tmpDir, '.codex', `deep-work.${sid}.md`);
    fs.writeFileSync(
      statePath,
      '---\ncurrent_phase: implement\nwork_dir: .deep-work/wd\nactive_slice: SLICE-001\n---\n'
    );
    fs.writeFileSync(path.join(tmpDir, '.codex', 'deep-work-current-session'), sid);

    const filePath = path.join(tmpDir, 'edge "quoted".py');
    execFileSync('bash', [path.join(HOOKS, 'file-tracker.sh')], {
      input: envelope('Write', { file_path: filePath }, 'PostToolUse'),
      cwd: tmpDir,
      env: { ...process.env, DEEP_WORK_SESSION_ID: sid },
      encoding: 'utf8',
      timeout: 5000,
    });

    const receiptPath = path.join(tmpDir, '.deep-work', 'wd', 'receipts', 'SLICE-001.json');
    assert.ok(fs.existsSync(receiptPath), `receipt not created at ${receiptPath}`);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    assert.ok(
      receipt.changes.files_modified.includes(filePath),
      `receipt should contain the full escaped-quote path. Got:\n${JSON.stringify(receipt.changes.files_modified)}`
    );
  });

  it('phase-transition.sh: escaped-quote path in unrelated write does not crash', () => {
    // phase-transition only acts on .codex/deep-work.{sid}.md writes; a
    // regular file with quotes in its name must be a quick no-op exit 0.
    const result = spawnSync('bash', [path.join(HOOKS, 'phase-transition.sh')], {
      input: envelope('Write', { file_path: '/tmp/x "q" y.txt' }, 'PostToolUse'),
      cwd: tmpDir,
      env: { ...process.env },
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
  });
});

describe('e2e: phase-transition.sh handles fork worktree paths', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-fork-'));
    // /deep-review 2026-04-26 C2: cache 는 .codex/, legacy state file 은 .codex/ (read_state_file fallback 검증).
    fs.mkdirSync(path.join(tmpDir, '.codex'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.codex'), { recursive: true });
  });
  afterEach(() => { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('fork path containing deep-work. twice: session_id is the innermost segment', () => {
    const childSid = 's-fork-child';
    const nestedDir = path.join(tmpDir, '.deep-work', 'sessions', 'deep-work.s-parent', 'sub', '.codex');
    fs.mkdirSync(nestedDir, { recursive: true });
    const statePath = path.join(nestedDir, `deep-work.${childSid}.md`);
    fs.writeFileSync(statePath, '---\ncurrent_phase: plan\n---\n');
    fs.writeFileSync(path.join(tmpDir, '.codex', 'deep-work-current-session'), childSid);

    const result = spawnSync('bash', [path.join(HOOKS, 'phase-transition.sh')], {
      input: envelope('Write', { file_path: statePath }, 'PostToolUse'),
      cwd: tmpDir,
      env: { ...process.env },
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);

    // The cache file must be named correctly — no slashes inside SESSION_ID.
    // /deep-review 2026-04-26 C2: phase-transition.sh 가 .phase-cache-${SID} 를 .codex/ 에 쓴다.
    const entries = fs.readdirSync(path.join(tmpDir, '.codex'));
    const cacheFiles = entries.filter(e => e.startsWith('.phase-cache-'));
    assert.equal(cacheFiles.length, 1, `expected 1 cache file, got: ${JSON.stringify(cacheFiles)}`);
    assert.equal(cacheFiles[0], `.phase-cache-${childSid}`);
  });
});
