# 변경 이력

## Unreleased — Phase A 완료 (2026-04-25)

- Phase A scaffold 완료: plugin.json + AGENTS.md + scripts/migrate-from-claude/ + lib JSON 룰셋 + vendor copy + 테스트 baseline (600)
- 10개 OI 처리 (Critical 5 RESOLVED + Medium 3 RESOLVED + OI-2 DEFERRED + OI-11 NEW DEFERRED)
- Phase B 진입 가능 상태

## 0.1.0 — TBD (Phase E 릴리스)

첫 릴리스 예정 — claude-deep-work v6.4.0 의 Codex CLI 포팅 (B-α 스코프).

- 5단계 auto-flow (Brainstorm → Research → Plan → Implement → Test) 보존
- `multi_agent` feature flag 기반 parallel `spawn_agent` 디스패치
- per-file legacy 상태 import (`.claude/` → `.codex/`)
- Semantic loss 명시 (`AGENTS.md`) — per-call model override, per-agent tool whitelist, AskUserQuestion structured 옵션, TeamCreate/SendMessage primitives
