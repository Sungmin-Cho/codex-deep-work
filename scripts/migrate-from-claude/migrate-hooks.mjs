#!/usr/bin/env node
// migrate-hooks.mjs — CC hooks → Codex hooks transformation.
// <!-- migrated-by: codex-migrate v0.1 -->
//
// STATUS: stub (Phase B 구현 예정)
//
// 이 스크립트는 v0.1 알파에서 forked Gemini 변환 (BeforeTool/AfterTool/SessionEnd
// + write_file/replace + .gemini/deep-work + ${extensionPath}) 를 사용했으나,
// deep-review 결과 Codex 룰셋과 정면 충돌하여 제거됨.
//
// Phase B 재구현 룰셋 (source of truth):
// - lib/tool-mapping.json — native passthrough (Read/Write/Edit/Bash 등 변환 불필요)
// - lib/path-mapping.json — state_path_replace 함수 API + plugin_root_replace
// - Codex 공식 hook events: SessionStart / PreToolUse / PostToolUse / Stop
//   + 추가 가능: PermissionRequest / UserPromptSubmit
// - hook command path: $(git rev-parse --show-toplevel)/.codex/hooks/scripts/<file>
// - stdin envelope: { session_id, transcript_path, cwd, hook_event_name, model,
//   turn_id, tool_name, tool_input } — CC와 거의 호환
//
// Phase B 작업 항목:
// 1. lib/tool-mapping.json + lib/path-mapping.json 로드
// 2. CC hooks/hooks.json 읽기 → Codex hooks.json 생성 (이벤트 명 동일, matcher 동일)
// 3. CC hooks/scripts/*.sh 의 .claude/ 리터럴 → state_path_replace 룰 적용 (read/write 분류)
// 4. CC env var (CLAUDE_TOOL_USE_*) → stdin envelope 파서 주입
// 5. ${CLAUDE_PLUGIN_ROOT} → plugin_root_replace 룰 적용
// 6. A' First-Run Install Pattern: hooks.json 을 plugin cache 에 두고
//    skill 본문에서 사용자 repo 의 .codex/hooks.json 으로 install prompt
//
// Reference: spec Section 3-2 + 3-4 + Phase B step 11

console.error('migrate-hooks.mjs: not yet implemented (Phase B). See spec Section 3-2/3-4 + Phase B step 11.');
console.error('  Required: load lib/tool-mapping.json + lib/path-mapping.json as source of truth.');
console.error('  Required: emit Codex event names (SessionStart/PreToolUse/PostToolUse/Stop), not Gemini.');
console.error("  Required: A' First-Run Install Pattern integration (OI-11).");
process.exit(1);
