# 변경 이력

## 0.1.0 — 2026-04-XX (예정)

첫 릴리스 — claude-deep-work v6.4.0 의 Codex CLI 포팅 (B-α 스코프).

- 5단계 auto-flow (Brainstorm → Research → Plan → Implement → Test) 보존
- `multi_agent` feature flag 기반 parallel `spawn_agent` 디스패치
- per-file legacy 상태 import (`.claude/` → `.codex/`)
- Semantic loss 명시 (`AGENTS.md`) — per-call model override, per-agent tool whitelist, AskUserQuestion structured 옵션, TeamCreate/SendMessage primitives
