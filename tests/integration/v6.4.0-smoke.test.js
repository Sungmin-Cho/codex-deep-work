// migrated-by: codex-migrate v0.1
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { verifyReceipts, parsePlanMd, parseStateFile } =
  require('../../hooks/scripts/verify-receipt-core.js');

const FIXTURES = path.join(__dirname, 'fixtures');

// N-R7: load plan from .md (via parsePlanMd) and state from .md (via parseStateFile)
// to exercise the SAME production code paths used by the runner.
function loadFixture(name) {
  const base = path.join(FIXTURES, name);
  const plan = parsePlanMd(path.join(base, 'plan.md'));
  const state = parseStateFile(path.join(base, 'state.md'));
  const rdir = path.join(base, 'receipts');
  const receipts = fs.readdirSync(rdir).sort().map((f) =>
    JSON.parse(fs.readFileSync(path.join(rdir, f), 'utf8'))
  );
  return { plan, state, receipts };
}

describe('v6.4.0 integration — verify-delegated-receipt', () => {
  it('ships runtime helpers referenced by orchestrator and Phase 5', () => {
    const root = path.join(__dirname, '..', '..');
    assert.equal(fs.existsSync(path.join(root, 'scripts', 'migrate-model-routing.js')), true);
    assert.equal(fs.existsSync(path.join(root, 'skills', 'deep-integrate', 'phase5-finalize.sh')), true);
    assert.equal(fs.existsSync(path.join(root, 'skills', 'deep-integrate', 'phase5-record-error.sh')), true);
  });

  it('Phase 5 helpers execute against .codex state and do not create legacy .claude state', () => {
    const root = path.join(__dirname, '..', '..');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase5-helper-'));
    const codexDir = path.join(tmp, '.codex');
    const workDir = path.join(tmp, 'work');
    const stateFile = path.join(codexDir, 'deep-work.s1.md');

    try {
      fs.mkdirSync(codexDir, { recursive: true });
      fs.mkdirSync(workDir);
      fs.writeFileSync(path.join(codexDir, 'deep-work-current-session'), 's1\n');
      fs.writeFileSync(stateFile, [
        '---',
        'work_dir: "work"',
        'phase5_work_dir_snapshot: "work"',
        '---',
        '# state',
      ].join('\n'));

      const env = { ...process.env, DEEP_WORK_SESSION_ID: 's1' };
      execFileSync('bash', [
        path.join(root, 'skills', 'deep-integrate', 'phase5-finalize.sh'),
        stateFile,
        '2026-04-19T03:45:00Z',
      ], { env, stdio: 'pipe' });
      execFileSync('bash', [
        path.join(root, 'skills', 'deep-integrate', 'phase5-record-error.sh'),
        workDir,
      ], { env, stdio: 'pipe' });

      const state = fs.readFileSync(stateFile, 'utf8');
      const loop = JSON.parse(fs.readFileSync(path.join(workDir, 'integrate-loop.json'), 'utf8'));

      assert.match(state, /phase5_completed_at: "2026-04-19T03:45:00Z"/);
      assert.equal(loop.session_id, 's1');
      assert.equal(loop.work_dir, 'work');
      assert.equal(loop.terminated_by, 'error');
      assert.equal(fs.existsSync(path.join(tmp, '.claude')), false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('deep-research separates session artifact work_dir from target root for Health Engine', () => {
    const root = path.join(__dirname, '..', '..');
    const skill = fs.readFileSync(path.join(root, 'skills', 'deep-research', 'SKILL.md'), 'utf8');

    assert.match(skill, /\$WORK_DIR.*세션 산출물 디렉토리/);
    assert.match(skill, /\$TARGET_ROOT/);
    assert.match(skill, /health-check\.js "\$TARGET_ROOT" --skip-audit/);
    assert.doesNotMatch(skill, /health-check\.js "\$WORK_DIR" --skip-audit/);
    assert.doesNotMatch(skill, /\$WORK_DIR\/\.deep-review\/fitness\.json/);
  });

  it('hooks template and Phase 5 guard agree on suite marketplace cache path', () => {
    const root = path.join(__dirname, '..', '..');
    const hooksTemplate = fs.readFileSync(path.join(root, 'hooks', 'hooks-template.json'), 'utf8');
    const phaseGuard = fs.readFileSync(path.join(root, 'hooks', 'scripts', 'phase-guard.sh'), 'utf8');

    assert.match(hooksTemplate, /codex-deep-suite\/deep-work\/\$\{PLUGIN_SHA\}/);
    assert.doesNotMatch(hooksTemplate, /cache\/codex-deep-work\/\$\{PLUGIN_SHA\}/);
    assert.match(phaseGuard, /codex-deep-suite\/deep-work\/\*\/skills\/deep-integrate/);
  });

  it('active runtime docs/scripts do not direct writes or deletes to legacy .claude cache paths', () => {
    const root = path.join(__dirname, '..', '..');
    const updateCheck = fs.readFileSync(path.join(root, 'hooks', 'scripts', 'update-check.sh'), 'utf8');
    const deepResume = fs.readFileSync(path.join(root, 'commands', 'deep-resume.md'), 'utf8');

    assert.match(updateCheck, /STATE_DIR="\$HOME\/\.codex"/);
    assert.doesNotMatch(updateCheck, /STATE_DIR="\$HOME\/\.claude"/);
    assert.doesNotMatch(deepResume, /rm -f \.claude\/\.phase-cache/);
    assert.match(deepResume, /rm -f \.codex\/\.phase-cache/);
  });

  it('migrate-model-routing preserves plan=main while migrating delegated phases', () => {
    const root = path.join(__dirname, '..', '..');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'model-routing-'));
    const stateFile = path.join(tmp, 'deep-work.S1.md');
    fs.writeFileSync(stateFile, [
      '---',
      'model_routing:',
      '  research: main',
      '  plan: main',
      '  implement: "main" # legacy',
      '  test: main-beta',
      '---',
      '',
    ].join('\n'));

    try {
      const { migrateStateFile } = require(path.join(root, 'scripts', 'migrate-model-routing.js'));
      const result = migrateStateFile(stateFile);
      const migrated = fs.readFileSync(stateFile, 'utf8');

      assert.deepEqual(result.replaced, ['research', 'implement']);
      assert.deepEqual(result.warnings, ['unknown model_routing.test value "main-beta" — preserved as-is']);
      assert.match(migrated, /research: "sonnet"/);
      assert.match(migrated, /plan: main/);
      assert.match(migrated, /implement: "sonnet" # legacy/);
      assert.match(migrated, /test: main-beta/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('passing fixture → pass=true (exercises parsePlanMd + parseStateFile)', () => {
    const { plan, state, receipts } = loadFixture('passing');
    // Sanity: fixtures actually drive parse paths
    assert.equal(plan.slices.length, 2, 'parsePlanMd must find both slices');
    assert.deepEqual(plan.slices[0].files, ['src/a.js']);
    assert.equal(state.tdd_mode, 'strict');

    const r = verifyReceipts({ plan, receipts, tdd_mode: state.tdd_mode, skip_git_checks: true });
    assert.equal(r.pass, true, JSON.stringify(r.errors));
  });

  it('blocked-fail → pass=false with item 2 error (F10)', () => {
    const { plan, state, receipts } = loadFixture('blocked-fail');
    const r = verifyReceipts({ plan, receipts, tdd_mode: state.tdd_mode, skip_git_checks: true });
    assert.equal(r.pass, false);
    assert.match(r.errors.join('\n'), /\[item 2\].*blocked/);
  });

  it('tdd-hardfail → pass=false with item 7 error (W8)', () => {
    const { plan, state, receipts } = loadFixture('tdd-hardfail');
    const r = verifyReceipts({ plan, receipts, tdd_mode: state.tdd_mode, skip_git_checks: true });
    assert.equal(r.pass, false);
    assert.match(r.errors.join('\n'), /\[item 7\].*red_verification_output.*trivial/i);
  });

  it('item 8 advisory warning when verification_output mismatches (N-R5)', () => {
    // Synthetic fixture — receipt with verification_cmd + mismatched output
    const { plan, state } = loadFixture('passing');
    const receipts = [{
      slice_id: 'SLICE-001',
      status: 'complete',
      tdd: {
        state_transitions: ['PENDING', 'RED_VERIFIED', 'GREEN', 'SENSOR_CLEAN'],
        red_verification_output: 'AssertionError: real\n  at a.js:1',
      },
      git_before_slice: 'x', git_after_slice: 'y',
      changes: { git_diff: '' },
      sensor_results: { lint: 'pass' },
      spec_compliance: {
        verification_cmd: 'npm test',
        expected_output: 'Tests: 2 passed',
        verification_output: 'Tests: 1 passed',  // mismatch
      },
      slice_review: {}, harness_metadata: {},
    }];
    const r = verifyReceipts({
      plan: { slices: [plan.slices[0]] },  // single-slice view
      receipts, tdd_mode: state.tdd_mode, skip_git_checks: true,
    });
    // pass still true (advisory, not hard fail), warnings present
    assert.equal(r.pass, true);
    assert.ok(r.warnings && r.warnings.length > 0);
    assert.match(r.warnings.join('\n'), /item 8 ADVISORY/);
  });

  it('--only-completed flag filters mixed-status receipts before verification (W-3.2)', () => {
    // W-3.2: ensure the runner's `onlyCompleted === '1'` branch filters out
    // blocked/blocked-upstream receipts so resume paths can verify only
    // already-accepted slices without the blocked ones forcing a fail.
    const { execFileSync } = require('node:child_process');
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');

    // Build a temp fixture with 1 complete + 1 blocked receipt.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'only-completed-'));
    fs.writeFileSync(path.join(tmp, 'state.md'),
      '---\ntdd_mode: "strict"\n---\n');
    fs.writeFileSync(path.join(tmp, 'plan.md'), [
      '# Plan',
      '',
      '## Slice Checklist',
      '',
      '- [ ] SLICE-001: done',
      '  - files: [a.js]',
      '  - size: S',
      '',
      '- [ ] SLICE-002: blocked',
      '  - files: [b.js]',
      '  - size: S',
    ].join('\n'));
    const rdir = path.join(tmp, 'receipts');
    fs.mkdirSync(rdir);
    const baseReceipt = (id, status) => ({
      slice_id: id, status,
      tdd: {
        state_transitions: ['PENDING', 'RED_VERIFIED', 'GREEN', 'SENSOR_CLEAN'],
        red_verification_output: 'AssertionError: real\n  at x.js:1',
      },
      git_before_slice: 'A', git_after_slice: 'B',
      changes: { git_diff: '' },
      sensor_results: { lint: 'pass' },
      spec_compliance: {},
      slice_review: {}, harness_metadata: {},
    });
    fs.writeFileSync(path.join(rdir, 'SLICE-001.json'),
      JSON.stringify(baseReceipt('SLICE-001', 'complete')));
    fs.writeFileSync(path.join(rdir, 'SLICE-002.json'),
      JSON.stringify(baseReceipt('SLICE-002', 'blocked')));

    // Without --only-completed: runner should fail (item 2 rejects blocked)
    const scriptDir = path.join(__dirname, '..', '..', 'hooks', 'scripts');
    let failed = false;
    try {
      execFileSync('node',
        [path.join(scriptDir, 'verify-delegated-receipt-runner.js'),
         scriptDir,
         path.join(tmp, 'state.md'),
         rdir,
         path.join(tmp, 'plan.md'),
         '',    // skipItemsCsv empty
         '0'],  // onlyCompleted=0
        { stdio: 'pipe' });
    } catch (e) {
      failed = true;
    }
    assert.equal(failed, true, 'without --only-completed, blocked receipt should fail');

    // With --only-completed: runner should pass (blocked filtered out,
    // only SLICE-001 is verified, plan has 2 slices but skip_items needed
    // to avoid item 1 count mismatch. Simulating resume path: complete
    // receipts are already accepted.)
    // Use skip_items=1 to bypass count mismatch since plan has 2 slices
    // but we're only verifying 1 after filter.
    const out = execFileSync('node',
      [path.join(scriptDir, 'verify-delegated-receipt-runner.js'),
       scriptDir,
       path.join(tmp, 'state.md'),
       rdir,
       path.join(tmp, 'plan.md'),
       '1',   // skipItemsCsv = skip item 1 (count mismatch)
       '1'],  // onlyCompleted=1
      { stdio: 'pipe', encoding: 'utf8' });
    assert.match(out, /all items pass \(1 receipts\)/,
      '--only-completed with skip_items=1 should pass, filtering blocked');

    // cleanup
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
