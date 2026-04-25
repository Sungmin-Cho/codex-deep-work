#!/usr/bin/env node
// migrate-skills.mjs — CC commands + skills → Codex skills.
// <!-- migrated-by: codex-migrate v0.1 -->
//
// STATUS: stub (Phase B 구현 예정)
//
// 이 스크립트는 v0.1 알파에서 forked Gemini 변환 (write_file/replace/run_shell_command
// + tracker_create_task/.../tracker_get_task + ${extensionPath} + .gemini/deep-work)
// 을 사용했으나, deep-review 결과 Codex 룰셋과 정면 충돌하여 제거됨.
//
// Phase B 재구현 룰셋 (source of truth):
// - lib/tool-mapping.json — Codex 의 native_passthrough (Read/Write/Edit/MultiEdit/
//   Glob/Grep/Bash/WebFetch/WebSearch) 는 변환 불필요. Gemini 처럼 tool 이름 변경 금지.
// - lib/tool-mapping.json — rename: TaskCreate/Update/List/Get/TodoWrite → update_plan
//   (자연어 plan-step 모델, 함수 호출 형식 유지하면 안 됨)
// - lib/tool-mapping.json — subagent: Task → spawn_agent 자연어 prompt
//   (single_pattern + parallel_pattern 두 형식)
// - lib/tool-mapping.json — natural_language_only: Skill / AskUserQuestion /
//   TeamCreate / TeamDelete / TeamGet / SendMessage 자연어 변환
// - lib/path-mapping.json — state_path_replace 함수 API (read/write 분류)
//
// Phase B 작업 항목:
// 1. lib/tool-mapping.json 로드 → native_passthrough 9 도구는 그대로 (변환 안 함)
// 2. rename 룰 적용: TaskCreate/Update/List/Get → "update_plan with these steps:"
// 3. subagent 룰 적용: Task(...) → 자연어 spawn_agent prompt
// 4. natural_language_only 룰 적용: TeamCreate/SendMessage 자연어 fallback
// 5. lib/path-mapping.json 적용: state 경로 함수 API + non-state literal_replace
// 6. AskUserQuestion structured options → 번호 매김 자연어 prompt
// 7. shared/references/*.md 본문도 변환 (W-O2)
// 8. <!-- migrated-by --> 마커로 idempotency 보장
//
// Reference: spec Section 3-1 + 3-3 + 3-5 + 3-6 + Phase B step 9

console.error('migrate-skills.mjs: not yet implemented (Phase B). See spec Section 3-1/3-3/3-5/3-6 + Phase B step 9.');
console.error('  Required: load lib/tool-mapping.json + lib/path-mapping.json as source of truth.');
console.error('  Required: NO Gemini tool renames (Codex native_passthrough).');
console.error('  Required: subagent.Task → spawn_agent natural-language prompt.');
console.error('  Required: SendMessage two-pattern (parallel aggregation vs sequential chain).');
process.exit(1);
