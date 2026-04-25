# AGENTS.md — codex-deep-work

> Codex CLI auto-load context for this plugin. **B-α scope** — see Semantic Losses section.

## Prerequisites

- Codex `multi_agent` + `codex_hooks` feature flags **both** must be enabled. In `~/.codex/config.toml`:
  ```toml
  [features]
  multi_agent = true
  codex_hooks = true
  ```
- Without `multi_agent`, parallel subagent dispatch (deep-research, deep-implement worker 분기) falls back to sequential or fails.
- Without `codex_hooks`, hook scripts (phase-guard, file-tracker, sensors) are inert — TDD enforcement and receipt validation degrade to natural-language only.

## First-Run Install (A')

deep-work plugin 의 hook 정의는 `<plugin-cache>/hooks-template.json` 에 동봉. plugin install 후 첫 `/deep-work` 실행 시:

1. skill 본문이 사용자 repo 의 `<repo>/.codex/hooks.json` 부재 검사
2. 부재 시 plugin cache 의 hook 정의 표시 + "설치하시겠습니까?" prompt
3. 승인 시 `<repo>/.codex/hooks.json` 으로 merge install
4. 거절 시 자연어 fallback 모드 (post-hoc receipt validation, enforcement 약화)

이 패턴은 Codex 의 `features.skill_mcp_dependency_install` 패턴 차용 (OI-11 에서 도입).

## Tool Mapping (CC → Codex)

| CC tool | Codex 등가 | 변환 방식 |
|---|---|---|
| Read / Write / Edit / MultiEdit / Glob / Grep / Bash / WebFetch / WebSearch | 동일 (native passthrough) | 변경 없음 |
| TaskCreate / TaskUpdate / TaskList / TaskGet / TodoWrite | `update_plan` | 자연어 plan-step 모델로 통합 |
| Task (single subagent dispatch) | `spawn_agent` (multi_agent) | 자연어 prompt — agents/<name>.md 본문이 message |
| Task (parallel, single message N개) | `spawn_agent` × N + wait × N + close_agent × N | parallel 자연어 변환 (slot=6) |
| Skill | (네이티브 호출) | "the <name> skill" 자연어 |
| AskUserQuestion (structured) | (자연어 ask) | 번호 매김 prompt — header/multiSelect 제약 deadwood |
| TeamCreate / TeamDelete / TeamGet | (미지원, B-α) | 자연어 fallback ("track parallel workers in main session memory") |
| SendMessage | (미지원, B-α) | 두 패턴 분리 — pattern 1 (parallel aggregation, 보존), pattern 2 (sequential chain, semantic loss) |
| NotebookEdit | (미지원) | Write fallback |
| Task(model=...) per-call override | (미지원) | model_routing field information-only |

## Semantic Losses (B-α)

B-α 스코프 (결정 2) — Codex v0.1.0 에서 다음 enforcement / semantic 은 약화 또는 손실됨:

| 항목 | CC 동작 | Codex v0.1.0 처리 | 회복 시점 |
|---|---|---|---|
| per-call `model` override (`Agent(model=...)`) | research/implement worker 별 model 분리 | 모든 worker 가 Codex 기본 model 사용. `model_routing` 필드 information-only | Codex `spawn_agent(model=...)` 추가 시 |
| per-agent `tools` whitelist (frontmatter) | 플러그인 레벨 강제 | 자연어 가이드 + post-hoc receipt validation (hook-derived `tools_used`) | Codex plugin.json `agents` 필드 + 제약 추가 시 |
| AskUserQuestion structured options | UI picker, 검증 응답 | 번호 매김 자연어 prompt — 자유 입력 | Codex structured ask 추가 시 |
| TeamCreate / SendMessage 패턴 1 (parallel aggregation) | N worker 동시 + main 결과 수집 | **B-α 에서 보존** (spawn_agent N + wait N + main aggregate) | (영향 없음) |
| TeamCreate / SendMessage 패턴 2 (sequential chain + 양방향 receipt) | team namespace + 양방향 메시지 | sequential chain (spec→test→impl), 단방향 main 경유 — semantic loss 명시 | Codex inter-agent message 추가 시 |
| Hook `CLAUDE_TOOL_USE_*` env var fallback | env var + stdin JSON 둘 다 지원 | stdin JSON 만. env var alias 는 backward-compat 으로 export | (영구) |

## State Namespace

- Runtime state under `.codex/deep-work/` and `.codex/deep-work.<SESSION>.md`
- Legacy `.claude/` paths read-only via `read_state_file()` (per-file import on first read)
- `.claude/` files never written by Codex

## Test Suite

- `node --test` from repo root
- baseline count frozen in `tests/.baseline-count` (Phase A snapshot, 600 tests on Node v22)
