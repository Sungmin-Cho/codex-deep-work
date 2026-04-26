# AGENTS.md — codex-deep-work

> Codex CLI 가 본 plugin 을 자동 로드할 때 참조하는 컨텍스트. **B-α scope** —
> 자세한 제약 사항은 아래 Semantic Losses 섹션 참조.

## Prerequisites

`~/.codex/config.toml` 에 두 feature flag 모두 활성화 필요:

```toml
[features]
multi_agent = true
codex_hooks = true
```

- `multi_agent` 미활성: parallel `spawn_agent` 호출 (deep-research / deep-implement
  의 worker 병렬 분기) 가 sequential 로 강등되거나 실패.
- `codex_hooks` 미활성: hook 스크립트 (`phase-guard`, `file-tracker`, sensors) 가
  inert — TDD enforcement 와 receipt 수집이 자연어 가이드 수준으로만 동작.

## First-Run Install (A')

deep-work plugin 의 hook 정의는 `<plugin-cache>/hooks-template.json` 으로 동봉.
plugin install 후 첫 `/deep-work` 실행 시 다음 절차로 사용자 repo 에 hook 설치:

1. skill 본문이 사용자 repo 의 `<repo>/.codex/hooks.json` 부재를 검사한다.
2. 부재 시 plugin cache 의 hook 정의를 표시하고 "설치하시겠습니까?" prompt 를 띄운다.
3. 승인 시 `<repo>/.codex/hooks.json` 으로 merge install 한다.
4. 거절 시 자연어 fallback 모드로 진행 — post-hoc receipt validation 만 작동, hook
   기반 enforcement 는 약화.

이 패턴은 Codex 의 `features.skill_mcp_dependency_install` 패턴을 차용 (OI-11).

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
| SendMessage | (미지원, B-α) | 두 패턴 분리 — pattern 1 (parallel aggregation, **B-α 보존**), pattern 2 (양방향 receipt, **deadwood** — Phase C #1 검증: implement-slice-worker SendMessage 0건이라 변환 불필요) |
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
| TeamCreate / SendMessage 패턴 2 (sequential chain + 양방향 receipt) | team namespace + 양방향 메시지 | **deadwood** — Phase C 부록 F #1 검증: v6.4.0 의 `implement-slice-worker` 가 SendMessage 0건이라 sequential chain 변환 불필요. Branch A 전체 미지원, env_var 활성 시 Branch B (pattern 1) 로 fall-through | Codex 가 inter-agent message 추가 시 (sequential chain 변환은 v0.2+ 후속) |
| Hook `CLAUDE_TOOL_USE_*` env var fallback | env var + stdin JSON 둘 다 지원 | stdin JSON envelope 만 active. `parse_hook_stdin` (lib/utils.sh) 가 jq 로 envelope 파싱 + `TOOL_NAME`/`TOOL_INPUT` 등 + **5 backward-compat env aliases (`CLAUDE_TOOL_USE_TOOL_NAME` 등) export** — vendor downstream 의 env-var fallback 코드는 alias 로 통과 (Phase C 부록 F #6) | (영구 — Codex 가 env var prepend 추가해도 alias 우선) |

## State Namespace

- Runtime state 위치: `.codex/deep-work/` 디렉토리 또는 `.codex/deep-work.<SESSION>.md` 파일
- Legacy `.claude/` 경로는 read-only — `read_state_file()` 가 1회 import 후 `.codex/` 로 복사 (per-file resolution)
- `.codex/` 가 우선 (write target). `.claude/` 는 Codex 가 절대 쓰지 않음 — CC 본가 호환성 보존

## Receipt 검증 (Post-hoc Tool Whitelist Enforcement)

Codex 는 plugin 레벨 per-agent `tools` whitelist 강제 불가능 (CC frontmatter
`tools:` 필드 미지원). 대신 receipt 사후 검증으로 위반 신호화:

- `assumptions.json` 의 `post_hoc_tool_whitelist_enforcement` assumption (Phase C #4)
- file-tracker.sh 가 PostToolUse 마다 invoked TOOL_NAME 을 receipt 의
  `tools_used` 배열에 dedup-append + envelope `.model` 을 `model_used` 로 기록
- Phase D: `verify-receipt-core.js` 가 `tools_used` 를 agent `.md` 본문의 자연어
  tools 가이드 ("You may only use Read/Grep tools") 와 대조하여 위반 검출

## Test Suite

- 실행: 레포 루트에서 `node --test`
- Baseline 카운트: `tests/.baseline-count = 1320` (Phase E quality pass 에서 deep-integrate schema subtests 활성화 후 갱신)
- Expected fail 카운트: `tests/.expected-fail-count = 97` (Phase E quality pass 에서 JSON fixture/schema + deep-integrate scripts + v6.4 smoke fixtures 복구 후 갱신)
- verify-migration.sh 가 count + pass/fail 둘 다 검증 (`/deep-review 2026-04-26 C5` fix)
