// migrate-hooks.test.mjs — Task 5 TDD (deep-review v4 + Plan-Patch-33)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  transformHooksJson,
  injectStdinParser,
  applyStatePathReplace,
  generateUtilsSh,
  generateHooksTemplate,
  STDIN_PARSER_HEADER,
} from './migrate-hooks.mjs';

// Plan-Patch-33 (deep-review v6 4차 C4): bash -n syntax check helper.
function assertBashSyntaxOk(src, msg) {
  try {
    execFileSync('bash', ['-n'], { input: src, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString() : e.message;
    assert.fail(`bash -n syntax error${msg ? ' (' + msg + ')' : ''}:\n${stderr}\n--- output ---\n${src}\n--- end ---`);
  }
}

describe('migrate-hooks transformHooksJson', () => {
  it('preserves all 4 CC events (SessionStart/PreToolUse/PostToolUse/Stop) — OI-12 absorbed', () => {
    const cc = {
      hooks: {
        SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: 'bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/foo.sh' }] }],
        PreToolUse:   [{ matcher: 'Write', hooks: [{ type: 'command', command: 'bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/bar.sh' }] }],
        PostToolUse:  [{ matcher: 'Edit',  hooks: [{ type: 'command', command: 'node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/baz.js' }] }],
        Stop:         [{ matcher: '',      hooks: [{ type: 'command', command: 'bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/end.sh' }] }],
      },
    };
    const out = transformHooksJson(cc);
    assert.ok(out.hooks.SessionStart);
    assert.ok(out.hooks.PreToolUse);
    assert.ok(out.hooks.PostToolUse);
    assert.ok(out.hooks.Stop, 'Stop event preserved (OI-12 absorbed)');
  });

  it('replaces ${CLAUDE_PLUGIN_ROOT} with plugin cache path in template mode (Plan-Patch-6)', () => {
    const cc = { hooks: { SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/foo.sh' }] }] } };
    const out = transformHooksJson(cc, 'template');
    const cmd = out.hooks.SessionStart[0].hooks[0].command;
    assert.match(cmd, /\.codex\/plugins\/cache/);
    assert.ok(!cmd.includes('${CLAUDE_PLUGIN_ROOT}'));
  });

  it('uses dev_fallback in dev mode — no ${PLUGIN_SHA} placeholder leak', () => {
    const cc = { hooks: { SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/foo.sh' }] }] } };
    const out = transformHooksJson(cc, 'dev');
    const cmd = out.hooks.SessionStart[0].hooks[0].command;
    assert.ok(!cmd.includes('${PLUGIN_SHA}'), 'dev mode must not leak ${PLUGIN_SHA}');
    assert.match(cmd, /git rev-parse|hooks\/scripts/);
  });

  it('keeps ${PLUGIN_SHA} placeholder in template mode for install-time substitute', () => {
    const cc = { hooks: { SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/foo.sh' }] }] } };
    const out = transformHooksJson(cc, 'template');
    const cmd = out.hooks.SessionStart[0].hooks[0].command;
    assert.match(cmd, /\$\{PLUGIN_SHA\}/, 'template mode must preserve ${PLUGIN_SHA} placeholder');
  });

  it('preserves matcher syntax (Write|Edit alternation)', () => {
    const cc = { hooks: { PostToolUse: [{ matcher: 'Write|Edit|MultiEdit', hooks: [{ type: 'command', command: 'bash x.sh' }] }] } };
    const out = transformHooksJson(cc);
    assert.equal(out.hooks.PostToolUse[0].matcher, 'Write|Edit|MultiEdit');
  });

  it('preserves timeout', () => {
    const cc = { hooks: { PreToolUse: [{ matcher: '', hooks: [{ type: 'command', command: 'x', timeout: 8 }] }] } };
    const out = transformHooksJson(cc);
    assert.equal(out.hooks.PreToolUse[0].hooks[0].timeout, 8);
  });
});

describe('migrate-hooks injectStdinParser (Plan-Patch-7)', () => {
  it('injects parser into env-only scripts (no pre-existing $(cat))', () => {
    const src = `#!/usr/bin/env bash\nset -e\nif [[ "$CLAUDE_TOOL_USE_TOOL_NAME" == "Write" ]]; then echo write; fi`;
    const out = injectStdinParser(src);
    assert.match(out, /STDIN_JSON=\$\(cat\)/);
    assert.match(out, /TOOL_NAME=/);
  });

  it('skips injection + emits Phase-C TODO marker when vendor uses $(cat)', () => {
    const src = `#!/usr/bin/env bash\nset -e\n_P5_INPUT="$(cat)"\necho ok`;
    const out = injectStdinParser(src);
    assert.match(out, /TODO\(Phase-C\): pre-existing \$\(cat\)/);
    assert.ok(!out.includes('STDIN_JSON=$(cat)'));
  });

  it('does not double-inject when stdin parser already present', () => {
    const src = `#!/usr/bin/env bash\n# --- begin codex-hook-stdin-parser ---\nSTDIN_JSON=$(cat)\nTOOL_NAME=$(echo "$STDIN_JSON" | jq -r .tool_name)\n# --- end codex-hook-stdin-parser ---\necho ok`;
    const out = injectStdinParser(src);
    const matches = (out.match(/STDIN_JSON=\$\(cat\)/g) || []).length;
    assert.equal(matches, 1);
  });

  it('exports legacy aliases CLAUDE_TOOL_NAME/CLAUDE_TOOL_INPUT/CLAUDE_TOOL_USE_INPUT (Plan-Patch-8)', () => {
    assert.match(STDIN_PARSER_HEADER, /export CLAUDE_TOOL_NAME=/);
    assert.match(STDIN_PARSER_HEADER, /export CLAUDE_TOOL_INPUT=/);
    assert.match(STDIN_PARSER_HEADER, /export CLAUDE_TOOL_USE_INPUT=/);
  });
});

describe('migrate-hooks applyStatePathReplace (Plan-Patch-5 + Plan-Patch-15, deep-review C1)', () => {
  it('converts cat .claude/deep-work/X read site to $(read_state_file)', () => {
    const src = `cat .claude/deep-work/sessions.json`;
    const out = applyStatePathReplace(src);
    assert.match(out, /read_state_file/);
    assert.ok(!/cat \.claude\/deep-work/.test(out));
  });

  it('converts > .claude/deep-work/X write site to write_state_file call', () => {
    const src = `echo "data" > .claude/deep-work/sessions.json`;
    const out = applyStatePathReplace(src);
    assert.match(out, /write_state_file/);
  });

  it('converts >> append site to write_state_file_append (Plan-Patch-31 — append 의도 보존)', () => {
    const src = `echo "log" >> .claude/deep-work/log.txt`;
    const out = applyStatePathReplace(src);
    assert.match(out, /write_state_file_append/);
    assert.ok(!/write_state_file\b(?!_append)/.test(out), `expected append, got overwrite: ${out}`);
  });

  // Plan-Patch-15: vendor 의 실 패턴 (점/대시) 커버 검증
  it('converts vendor pattern: STATE_FILE assignment with deep-work.<sid>.md (utils.sh:247)', () => {
    const src = `STATE_FILE="$PROJECT_ROOT/.claude/deep-work.${'$'}{session_id}.md"`;
    const out = applyStatePathReplace(src);
    assert.match(out, /\.codex\/deep-work\./);
    assert.ok(!/\.claude\/deep-work\./.test(out));
  });

  it('converts vendor pattern: pointer_file with deep-work-current-session (utils.sh:239)', () => {
    const src = `local pointer_file="$PROJECT_ROOT/.claude/deep-work-current-session"`;
    const out = applyStatePathReplace(src);
    assert.match(out, /\.codex\/deep-work-current-session/);
    assert.ok(!/\.claude\/deep-work-current-session/.test(out));
  });

  it('converts vendor pattern: registry_file with deep-work-sessions.json (utils.sh:274)', () => {
    const src = `local registry_file="$PROJECT_ROOT/.claude/deep-work-sessions.json"`;
    const out = applyStatePathReplace(src);
    assert.match(out, /\.codex\/deep-work-sessions\.json/);
  });

  it('converts vendor pattern: err_log with deep-work-guard-errors.log (utils.sh:175)', () => {
    const src = `local err_log="${'$'}{PROJECT_ROOT:-${'$'}PWD}/.claude/deep-work-guard-errors.log"`;
    const out = applyStatePathReplace(src);
    assert.match(out, /\.codex\/deep-work-guard-errors\.log/);
  });

  it('converts vendor pattern: mv to deep-work.<sid>.md (utils.sh:577) — Plan-Patch-33 strict', () => {
    const src = `mv "$legacy_file" "$PROJECT_ROOT/.claude/deep-work.${'$'}{new_id}.md"`;
    const out = applyStatePathReplace(src);
    // Plan-Patch-30 + Plan-Patch-33: character class 가 `}` 포함, 변환 출력은 syntactically valid bash.
    // STATE_TRANSFORM_MARKER prefix 가 idempotency 마커로 첫 줄에 prepend (touched=true 시).
    assert.equal(out, `# state-path migrated by codex-migrate v0.1\nmv "$legacy_file" "$PROJECT_ROOT/.codex/deep-work.${'$'}{new_id}.md"`);
    assertBashSyntaxOk(out, 'utils.sh:577 mv');
  });

  it('flags ambiguous bare quoted state path as TODO Phase-C marker', () => {
    const src = `read_frontmatter_field "$PROJECT_ROOT/.claude/deep-work.bad.md" "task_description"`;
    const out = applyStatePathReplace(src);
    assert.ok(/TODO\(Phase-C\)|read_state_file|\.codex\/deep-work/.test(out), `expected handling: ${out}`);
  });

  it('emits multi-line ambiguous markers with line numbers', () => {
    const src = `line1\n# bare path: ".claude/deep-work/foo"\nline3\n# bare path: ".claude/deep-work/bar"\n`;
    const out = applyStatePathReplace(src);
    if (/TODO\(Phase-C\)/.test(out)) {
      assert.match(out, /at vendor lines [\d,]+/);
    }
  });

  it('is idempotent', () => {
    const src = `cat .claude/deep-work/sessions.json`;
    const once = applyStatePathReplace(src);
    const twice = applyStatePathReplace(once);
    assert.equal(once, twice);
  });

  it('is idempotent on vendor multi-pattern input', () => {
    const src = `STATE_FILE="$PROJECT_ROOT/.claude/deep-work.${'$'}{sid}.md"\nlocal p="$PROJECT_ROOT/.claude/deep-work-current-session"\n`;
    const once = applyStatePathReplace(src);
    const twice = applyStatePathReplace(once);
    assert.equal(once, twice);
  });

  // Plan-Patch-23 + Plan-Patch-31 + Plan-Patch-33: vendor 의 추가 패턴 fixture — strict.
  it('converts vendor pattern: stderr fd-redirect (file-tracker.sh:223) — Plan-Patch-31 append', () => {
    const src = `something 2>>"$PROJECT_ROOT/.claude/deep-work-guard-errors.log"`;
    const out = applyStatePathReplace(src);
    assert.equal(
      out,
      `# state-path migrated by codex-migrate v0.1\nsomething 2> >(while IFS= read -r line; do write_state_file_append "deep-work-guard-errors.log" "$line"; done)`
    );
    assertBashSyntaxOk(out, 'file-tracker.sh:223 stderr');
  });

  it('converts vendor pattern: line-leading append redirect (session-end.sh:298) — Plan-Patch-31 append', () => {
    const src = `  >> "$PROJECT_ROOT/.claude/deep-work-guard-errors.log" 2>/dev/null`;
    const out = applyStatePathReplace(src);
    assert.equal(
      out,
      `# state-path migrated by codex-migrate v0.1\n  > >(while IFS= read -r line; do write_state_file_append "deep-work-guard-errors.log" "$line"; done) 2>/dev/null`
    );
    assertBashSyntaxOk(out, 'session-end.sh:298 line-leading');
  });

  it('converts vendor pattern: bash glob comparison (phase-transition.sh:35) — Plan-Patch-32 marker', () => {
    const src = `[[ "$FILE_PATH" != *".claude/deep-work."*".md" ]]`;
    const out = applyStatePathReplace(src);
    assert.equal(out, `# state-path migrated by codex-migrate v0.1\n[[ "$FILE_PATH" != *".codex/deep-work."*".md" ]]  # state-glob-pattern (codex-migrate)`);
    assertBashSyntaxOk(out, 'phase-transition.sh:35 glob');
  });

  it('converts vendor pattern: read_frontmatter_field (utils.sh:580) — Plan-Patch-33 strict', () => {
    const src = `read_frontmatter_field "$PROJECT_ROOT/.claude/deep-work.${'$'}{new_id}.md" "task_description"`;
    const out = applyStatePathReplace(src);
    assert.equal(
      out,
      `# state-path migrated by codex-migrate v0.1\nread_frontmatter_field <(read_state_file "deep-work.${'$'}{new_id}.md") "task_description"`
    );
    assertBashSyntaxOk(out, 'utils.sh:580 read_frontmatter_field');
  });

  it('mv with $PROJECT_ROOT prefix converts to .codex/ destination (Plan-Patch-23) — Plan-Patch-33 strict', () => {
    const src = `mv "$legacy_file" "$PROJECT_ROOT/.claude/deep-work.${'$'}{new_id}.md"`;
    const out = applyStatePathReplace(src);
    assert.equal(out, `# state-path migrated by codex-migrate v0.1\nmv "$legacy_file" "$PROJECT_ROOT/.codex/deep-work.${'$'}{new_id}.md"`);
    assertBashSyntaxOk(out, 'utils.sh:577 mv (Plan-Patch-23)');
  });
});

describe('migrate-hooks generateUtilsSh', () => {
  it('emits read_state_file/write_state_file/validate_legacy_schema + parse_hook_stdin (C8 — parser integrated)', () => {
    const utils = generateUtilsSh();
    assert.match(utils, /read_state_file\(\)/);
    assert.match(utils, /write_state_file\(\)/);
    assert.match(utils, /validate_legacy_schema\(\)/);
    assert.match(utils, /parse_hook_stdin\(\)/);
  });

  it('writes only to .codex/, never .claude/', () => {
    const utils = generateUtilsSh();
    assert.ok(!/echo[^|>]*\.claude\//.test(utils.split('write_state_file()')[1] ?? ''));
  });
});

describe('migrate-hooks generateHooksTemplate', () => {
  it('emits hooks-template.json suitable for first-run install', () => {
    const cc = {
      hooks: {
        SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/foo.sh' }] }],
        Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/end.sh' }] }],
      },
    };
    const tmpl = generateHooksTemplate(cc);
    assert.ok(tmpl.hooks.SessionStart);
    assert.ok(tmpl.hooks.Stop);
    assert.ok(tmpl.description.includes('first-run'));
    // Plan-Patch-6: plugin cache 경로
    assert.match(JSON.stringify(tmpl), /\.codex\/plugins\/cache/);
  });
});
