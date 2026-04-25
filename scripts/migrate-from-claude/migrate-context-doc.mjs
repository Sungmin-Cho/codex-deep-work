#!/usr/bin/env node
// migrate-context-doc.mjs — AGENTS.md skeleton 의 빈 섹션을 spec Section 3-1 + 3-6 본문으로 채움.
// <!-- migrated-by: codex-migrate v0.1 -->

import fs from 'node:fs';
import path from 'node:path';

const TOOL_MAPPING_TABLE = `| CC tool | Codex 등가 | 변환 방식 |
|---|---|---|
| Read / Write / Edit / MultiEdit / Glob / Grep / Bash / WebFetch / WebSearch | 동일 (native passthrough) | 변경 없음 |
| TaskCreate / TaskUpdate / TaskList / TaskGet / TodoWrite | \`update_plan\` | 자연어 plan-step 모델로 통합 |
| Task (single subagent dispatch) | \`spawn_agent\` (multi_agent) | 자연어 prompt — agents/<name>.md 본문이 message |
| Task (parallel, single message N개) | \`spawn_agent\` × N + wait × N + close_agent × N | parallel 자연어 변환 (slot=6) |
| Skill | (네이티브 호출) | "the <name> skill" 자연어 |
| AskUserQuestion (structured) | (자연어 ask) | 번호 매김 prompt — header/multiSelect 제약 deadwood |
| TeamCreate / TeamDelete / TeamGet | (미지원, B-α) | 자연어 fallback ("track parallel workers in main session memory") |
| SendMessage | (미지원, B-α) | 두 패턴 분리 — pattern 1 (parallel aggregation, 보존), pattern 2 (sequential chain, semantic loss) |
| NotebookEdit | (미지원) | Write fallback |
| Task(model=...) per-call override | (미지원) | model_routing field information-only |
`;

const SEMANTIC_LOSSES_TABLE = `B-α 스코프 (결정 2) — Codex v0.1.0 에서 다음 enforcement / semantic 은 약화 또는 손실됨:

| 항목 | CC 동작 | Codex v0.1.0 처리 | 회복 시점 |
|---|---|---|---|
| per-call \`model\` override (\`Agent(model=...)\`) | research/implement worker 별 model 분리 | 모든 worker 가 Codex 기본 model 사용. \`model_routing\` 필드 information-only | Codex \`spawn_agent(model=...)\` 추가 시 |
| per-agent \`tools\` whitelist (frontmatter) | 플러그인 레벨 강제 | 자연어 가이드 + post-hoc receipt validation (hook-derived \`tools_used\`) | Codex plugin.json \`agents\` 필드 + 제약 추가 시 |
| AskUserQuestion structured options | UI picker, 검증 응답 | 번호 매김 자연어 prompt — 자유 입력 | Codex structured ask 추가 시 |
| TeamCreate / SendMessage 패턴 1 (parallel aggregation) | N worker 동시 + main 결과 수집 | **B-α 에서 보존** (spawn_agent N + wait N + main aggregate) | (영향 없음) |
| TeamCreate / SendMessage 패턴 2 (sequential chain + 양방향 receipt) | team namespace + 양방향 메시지 | sequential chain (spec→test→impl), 단방향 main 경유 — semantic loss 명시 | Codex inter-agent message 추가 시 |
| Hook \`CLAUDE_TOOL_USE_*\` env var fallback | env var + stdin JSON 둘 다 지원 | stdin JSON 만. env var alias 는 backward-compat 으로 export | (영구) |
`;

export function fillToolMappingSection(src) {
  return src.replace(
    /## Tool Mapping \(CC → Codex\)\s*\n\s*\(Section 3-1 of spec[^)]+\)\s*\n?/,
    `## Tool Mapping (CC → Codex)\n\n${TOOL_MAPPING_TABLE}\n`
  );
}

export function fillSemanticLossesSection(src) {
  return src.replace(
    /## Semantic Losses \(B-α\)\s*\n\s*\(Section 3-6 of spec[^)]+\)\s*\n?/,
    `## Semantic Losses (B-α)\n\n${SEMANTIC_LOSSES_TABLE}\n`
  );
}

const PREREQ_PATCH = `## Prerequisites

- Codex \`multi_agent\` and \`codex_hooks\` feature flags must both be enabled. In \`~/.codex/config.toml\`:

\`\`\`toml
[features]
multi_agent = true
codex_hooks = true
\`\`\`

- Without these flags, parallel subagent dispatch + hook system (TDD enforcement, receipt validation) will not work — degrades to natural-language fallback.
- First run will prompt to install hooks into \`<repo>/.codex/hooks.json\` (A' First-Run Install Pattern, OI-11). Decline to enter no-hook mode.
`;

function patchPrerequisites(src) {
  if (src.includes('codex_hooks = true')) return src;
  return src.replace(
    /## Prerequisites[\s\S]*?(?=\n## )/,
    PREREQ_PATCH + '\n'
  );
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2] || `${process.env.HOME}/Dev/codex-deep-work`;
  const agentsMd = path.join(target, 'AGENTS.md');
  if (!fs.existsSync(agentsMd)) {
    console.error(`migrate-context-doc: ${agentsMd} not found`);
    process.exit(1);
  }
  let body = fs.readFileSync(agentsMd, 'utf8');
  body = fillToolMappingSection(body);
  body = fillSemanticLossesSection(body);
  body = patchPrerequisites(body);
  fs.writeFileSync(agentsMd, body);
  console.error(`migrate-context-doc: filled AGENTS.md (Tool Mapping + Semantic Losses + Prerequisites)`);
}
