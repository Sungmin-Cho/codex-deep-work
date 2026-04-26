// migrate-context-doc.test.mjs — Task 8 TDD
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fillToolMappingSection, fillSemanticLossesSection } from './migrate-context-doc.mjs';

describe('migrate-context-doc fillToolMappingSection', () => {
  it('replaces "(Section 3-1 of spec — to be filled by ...)" with table content', () => {
    const stub = `## Tool Mapping (CC → Codex)\n\n(Section 3-1 of spec — to be filled by migrate-context-doc.mjs in Phase B)\n`;
    const out = fillToolMappingSection(stub);
    assert.ok(out.includes('| CC tool |') || out.includes('Read, Write, Edit'));
    assert.ok(!out.includes('to be filled'));
  });

  it('is idempotent', () => {
    const stub = `## Tool Mapping (CC → Codex)\n\n(Section 3-1 of spec — to be filled by migrate-context-doc.mjs in Phase B)\n`;
    const once = fillToolMappingSection(stub);
    const twice = fillToolMappingSection(once);
    assert.equal(once, twice);
  });
});

describe('migrate-context-doc fillSemanticLossesSection', () => {
  it('replaces "(Section 3-6 of spec — to be filled ...)" with semantic losses table', () => {
    const stub = `## Semantic Losses (B-α)\n\n(Section 3-6 of spec — to be filled by migrate-context-doc.mjs in Phase B)\n`;
    const out = fillSemanticLossesSection(stub);
    assert.match(out, /per-call model override|TeamCreate|SendMessage/);
    assert.ok(!out.includes('to be filled'));
  });
});
