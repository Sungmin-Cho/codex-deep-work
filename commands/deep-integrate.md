---
codex-capabilities: skill invocation, workspace-read/search, exec_command, spawn_agent, numbered-choice prompt
description: "Phase 5 Integrate — AI 추천 루프 명시적 호출 (Phase 4 Test 완료 후)"
argument-hint: "[--session=<id>] [--skip-integrate]"
---
<!-- migrated-by: codex-migrate v0.1 -->

> **Internal (v6.3.0)** — orchestrator가 자동 경로로 호출하며(`/deep-work` auto-flow의 Phase 5), 수동 재진입 시 사용자가 직접 이 커맨드를 호출한다.

# /deep-integrate

Phase 5: Integrate — 세션 아티팩트 + 설치된 플러그인 상태를 수집하여 AI가 다음 단계를 추천한다. `--skip-integrate`로 건너뛰거나 `finish`를 선택해 종료할 수 있다.

the deep-integrate skill
