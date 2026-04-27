// migrate-agents.test.mjs — Task 7 TDD (Plan-Patch-10)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  transformAgentFile, generateOpenaiYaml, extractToolWhitelistGuidance,
  parseFrontmatterTools,
} from './migrate-agents.mjs';

describe('migrate-agents parseFrontmatterTools (Plan-Patch-10)', () => {
  it('parses inline array form', () => {
    const fm = `name: x\ntools: [Read, Grep, Glob, Write]\n`;
    const tools = parseFrontmatterTools(fm);
    assert.deepEqual(tools, ['Read', 'Grep', 'Glob', 'Write']);
  });

  it('parses multi-line YAML list form (vendor 의 실제 형식)', () => {
    const fm = `name: research-codebase-worker\ntools:\n  - Read\n  - Grep\n  - Glob\n  - Write\n`;
    const tools = parseFrontmatterTools(fm);
    assert.deepEqual(tools, ['Read', 'Grep', 'Glob', 'Write']);
  });

  it('returns null when tools key is absent', () => {
    const fm = `name: x\nmodel: opus\n`;
    assert.equal(parseFrontmatterTools(fm), null);
  });

  it('handles single-item multi-line list', () => {
    const fm = `tools:\n  - Read\n`;
    assert.deepEqual(parseFrontmatterTools(fm), ['Read']);
  });
});

describe('migrate-agents transformAgentFile', () => {
  it('preserves metadata while converting tools frontmatter to codex-capabilities', () => {
    const src = `---\nname: research-codebase-worker\ntools: [Read, Grep, Glob]\nmodel: opus\n---\n\nWorker.`;
    const out = transformAgentFile(src);
    assert.match(out, /name:\s*research-codebase-worker/);
    assert.doesNotMatch(out, /^tools:/m);
    assert.match(out, /codex-capabilities:/);
    assert.match(out, /workspace-read\/search/);
    assert.match(out, /model:\s*opus/);
  });

  it('appends Codex capability guidance to body (inline form)', () => {
    const src = `---\nname: x\ntools: [Read, Grep, Glob, Write]\n---\n\nWorker.`;
    const out = transformAgentFile(src);
    assert.match(out, /Codex capability guidance/);
    assert.doesNotMatch(out, /Tool whitelist|You may only use Read/);
  });

  it('appends Codex capability guidance from multi-line YAML list (vendor form)', () => {
    const src = `---\nname: research-codebase-worker\ntools:\n  - Read\n  - Grep\n  - Glob\n  - Write\n---\n\nWorker.`;
    const out = transformAgentFile(src);
    assert.match(out, /Codex capability guidance/);
    assert.doesNotMatch(out, /^tools:|Tool whitelist|You may only use Read/m);
  });

  it('demotes per-call model override to information-only note', () => {
    const src = `---\nname: x\nmodel: opus\n---\n\nWorker.`;
    const out = transformAgentFile(src);
    assert.match(out, /model_routing|information.only|Codex worker uses default model/i);
  });
});

describe('migrate-agents body Task → spawn_agent', () => {
  it('converts Task dispatch references to spawn_agent natural language', () => {
    const src = `---\nname: x\n---\n\nDispatched via Task tool.`;
    const out = transformAgentFile(src);
    assert.ok(!/Task tool/.test(out));
  });
});

describe('migrate-agents extractToolWhitelistGuidance', () => {
  it('emits a guidance string from tools array', () => {
    const g = extractToolWhitelistGuidance(['Read', 'Grep', 'Glob']);
    assert.match(g, /Codex capability guidance/);
    assert.match(g, /workspace read\/search/);
    assert.doesNotMatch(g, /Tool whitelist|You may only use/);
  });
});

describe('migrate-agents generateOpenaiYaml', () => {
  it('emits agents.yaml with display_name and default_prompt (figma pattern, no tool constraints)', () => {
    const yaml = generateOpenaiYaml(['research-codebase-worker', 'implement-slice-worker']);
    assert.match(yaml, /research-codebase-worker/);
    assert.match(yaml, /implement-slice-worker/);
    assert.match(yaml, /display_name:/);
    assert.match(yaml, /default_prompt:/);
    assert.ok(!/allowed_tools|tool_whitelist/i.test(yaml));
  });
});
