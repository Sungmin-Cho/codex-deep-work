// migrate-skills.test.mjs — Task 3 TDD
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  transformSkillBody,
  prependFirstRunInstall,
} from './migrate-skills.mjs';

describe('migrate-skills Codex surface mapping', () => {
  it('maps Claude-native tool narration to Codex capability narration', () => {
    const src = `Use the Read tool to load the file. Then call Write to persist.`;
    const out = transformSkillBody(src, 'deep-research');
    assert.doesNotMatch(out, /Read tool|call Write/);
    assert.match(out, /workspace read\/search|apply_patch/);
  });

  it('replaces Claude plugin root and agent-team env vars', () => {
    const src = `node \${CLAUDE_PLUGIN_ROOT}/x.js && echo \${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}`;
    const out = transformSkillBody(src, 'deep-research');
    assert.doesNotMatch(out, /CLAUDE_PLUGIN_ROOT|CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS/);
    assert.match(out, /DEEP_WORK_PLUGIN_ROOT|multi_agent/i);
  });

  it('converts Claude Agent call form to Codex spawn_agent wording', () => {
    const src = `Agent(subagent_type="deep-work:research-codebase-worker", prompt="area=full")`;
    const out = transformSkillBody(src, 'deep-research');
    assert.doesNotMatch(out, /\bAgent\s*\(|subagent_type/);
    assert.match(out, /spawn_agent/);
  });

  it('converts bare subagent_type wording to Codex prompt contract wording', () => {
    const src = `zero-base 경우 subagent_type은 research-zerobase-worker.`;
    const out = transformSkillBody(src, 'deep-research');
    assert.doesNotMatch(out, /\bsubagent_type\b/);
    assert.match(out, /agent_prompt_contract/);
  });
});

describe('migrate-skills rename TaskCreate', () => {
  it('replaces "Use the TaskCreate tool" with "Update the plan via update_plan"', () => {
    const src = `Use the TaskCreate tool to add a task.`;
    const out = transformSkillBody(src, 'deep-plan');
    assert.ok(/update_plan/.test(out));
    assert.ok(!/TaskCreate/.test(out));
  });

  it('replaces TaskCreate( call form with natural language', () => {
    const src = `TaskCreate({ subject: "X", description: "Y" })`;
    const out = transformSkillBody(src, 'deep-plan');
    assert.ok(!/TaskCreate\(/.test(out));
  });

  it('also handles TaskUpdate, TaskList, TaskGet, TodoWrite', () => {
    const src = `Use TaskUpdate, TaskList, TaskGet, TodoWrite separately.`;
    const out = transformSkillBody(src, 'deep-implement');
    for (const t of ['TaskUpdate', 'TaskList', 'TaskGet', 'TodoWrite']) {
      assert.ok(!new RegExp(`\\b${t}\\b`).test(out), `${t} 잔존`);
    }
  });
});

describe('migrate-skills subagent.Task', () => {
  it('converts single Task dispatch to spawn_agent natural language', () => {
    const src = `Use the Task tool with subagent_type=research-codebase-worker, prompt="..."`;
    const out = transformSkillBody(src, 'deep-research');
    assert.ok(/spawn_agent/.test(out) || /worker agent/.test(out));
    assert.ok(!/Task tool/.test(out));
  });

  it('converts parallel Task block to N-way spawn pattern', () => {
    const src = `Single message with multiple Task calls (one per worker)`;
    const out = transformSkillBody(src, 'deep-research');
    assert.ok(!/Task calls/.test(out));
    assert.ok(/spawn|wait|parallel/i.test(out));
  });
});

describe('migrate-skills natural_language_only', () => {
  it('converts Skill("name") to "the <name> skill"', () => {
    const src = `Invoke Skill("deep-research") to start.`;
    const out = transformSkillBody(src, 'deep-work-orchestrator');
    assert.ok(/the deep-research skill/.test(out) || /the <deep-research> skill/.test(out));
    assert.ok(!/Skill\(/.test(out));
  });

  it('converts AskUserQuestion structured to numbered prompt', () => {
    const src = `Use AskUserQuestion({ questions: [{ header: "Mode", options: [{label:"A"},{label:"B"}] }] })`;
    const out = transformSkillBody(src, 'deep-work-orchestrator');
    assert.ok(!/AskUserQuestion\(/.test(out));
    assert.ok(/numbered|1\)|숫자/i.test(out));
  });

  it('converts migrated structured prompt blocks to plain numbered prompt wording', () => {
    const src = `번호형 사용자 확인:

- header: "Phase 1 완료. 어떻게 진행할까요?"
- multiSelect: false
- options:
  1. "다음 phase로 진행"
  2. "이 phase 재실행/수정"`;
    const out = transformSkillBody(src, 'deep-work-orchestrator');
    assert.doesNotMatch(out, /^- header:|^- multiSelect:|^- options:/m);
    assert.match(out, /사용자에게 다음 번호 중 하나로 응답하도록 묻는다/);
  });

  it('converts TeamCreate to natural language fallback', () => {
    const src = `TeamCreate({ team_name: "research-3way" })`;
    const out = transformSkillBody(src, 'deep-research');
    assert.ok(!/TeamCreate\(/.test(out));
    assert.ok(/main session memory|parallel workers/i.test(out));
  });

  it('converts SendMessage into two-pattern guidance', () => {
    const src = `SendMessage(to=worker_id, body="result")`;
    const out = transformSkillBody(src, 'deep-implement');
    assert.ok(!/SendMessage\(/.test(out));
  });
});

describe('migrate-skills OI-11 First-Run Install (Plan-Patch-2)', () => {
  it('prepends first-run install check to deep-work-orchestrator', () => {
    const src = `# deep-work-orchestrator\n\nStart the workflow.`;
    const out = prependFirstRunInstall(src, 'deep-work-orchestrator');
    assert.ok(/First-Run Hook Install Check/.test(out));
    assert.ok(/\.codex\/hooks\.json/.test(out));
  });

  it('does NOT prepend first-run install to other skills', () => {
    const src = `# deep-research\n\nResearch.`;
    const out = prependFirstRunInstall(src, 'deep-research');
    assert.ok(!/First-Run Hook Install Check/.test(out));
    assert.equal(out, src);
  });
});

describe('migrate-skills idempotency', () => {
  it('is idempotent on the full transform pipeline', () => {
    const src = `Use TaskCreate to plan. Then Skill("deep-implement").`;
    const once = transformSkillBody(src, 'deep-plan');
    const twice = transformSkillBody(once, 'deep-plan');
    assert.equal(once, twice);
  });
});
