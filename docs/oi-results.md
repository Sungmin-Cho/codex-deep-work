# OI Resolution Results — Phase A

각 OI 의 검증/실험 결과를 누적 기록. Phase A step 6 (Task 6) 에서 spec 본문 (`~/Dev/codex-deep-suite/docs/superpowers/specs/`) 갱신 시 이 파일이 reference.

**측정일**: 2026-04-25
**측정자**: sungmin (with Claude Code, Opus 4.7)
**측정 방법**: Codex 공식 문서 (developers.openai.com/codex/*) + 로컬 plugin cache 140 plugin 통계 분석

---

## OI-1: Codex hook 전반 검증 (Critical) — **RESOLVED**

### 1. 위치 — 핵심 발견

| 측정 | 결과 |
|---|---|
| 공식 hook 발견 위치 | `~/.codex/hooks.json` (글로벌) 또는 `<repo>/.codex/hooks.json` (project) — 또는 config.toml `[hooks]` |
| **Plugin 의 hooks.json 자동 인식** | **❌ 부재** |
| Plugin manifest `hooks` 필드 | **❌ 부재** (140 plugin 검사, 0/140) |
| figma plugin 의 hooks.json | draft — 실제 trigger 검증 안 됨, plugin.json 에 등록 안 됨 |

→ **Plugin 으로 hook 을 자동 배포하는 표준 메커니즘 없음**. 사용자 환경 (`<repo>/.codex/hooks.json`) 에 manual 또는 first-run install 필요.

### 2. 지원 events (6종)

CC 4종 (`SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`) 모두 지원 + 추가 2종:
- `PermissionRequest` — tool 권한 요청 (allow/deny 결정 가능)
- `UserPromptSubmit` — 사용자 prompt 제출 시점

→ deep-work 의 4 events 모두 보존 가능 + 추가 2종으로 확장 가능.

### 3. stdin 페이로드 — CC 호환

| 필드 | CC | Codex | 변환 |
|---|---|---|---|
| `session_id` | ✓ | ✓ | 동일 |
| `transcript_path` | ✓ | ✓ (nullable) | 동일 |
| `cwd` | ✓ | ✓ | 동일 |
| `hook_event_name` | ✓ | ✓ | 동일 |
| `tool_name` | ✓ | ✓ (PreToolUse 등) | 동일 |
| `tool_input` | ✓ | ✓ (PreToolUse 등) | 동일 |
| `tool_use_id` | (?) | ✓ | 신규 (PreToolUse) |
| `model` | ❌ | ✓ | 신규 |
| `turn_id` | ❌ | ✓ (turn-scoped) | 신규 |
| `source` | (?) | ✓ (SessionStart) | 신규 |

**fixture 변환 작업**: minimal — Gemini `migrate-fixtures.mjs` 의 stdin envelope 변환 룰 거의 그대로 사용 가능.

### 4. matcher 문법 — CC 호환

regex 기반 (`Bash`, `Edit|Write`, `^Bash$`, `mcp__filesystem__.*`, `*` / `""` / 생략 = match all).
→ deep-work 의 `Write|Edit` matcher 그대로 사용 가능.

### 5. exit code — CC 호환

| Exit | 의미 | CC 동등 |
|---|---|---|
| 0 (output 없음) | 성공, 진행 | 동일 |
| 0 + JSON | structured 응답 (decision, context) | 동일 |
| 2 + stderr | block/deny | 동일 |
| 그 외 | failure | 동일 |

### 6. CWD + timeout

- CWD: **session cwd** (plugin root 아님) — figma 의 relative path 가정과 일치
- timeout: 기본 **600초** (`timeout` 필드로 조정)

### 7. ${CLAUDE_PLUGIN_ROOT} 공식 권장 대체

```bash
# 공식 권장 (repo-local hooks)
"$(git rev-parse --show-toplevel)/.codex/hooks/script.py"
```

또는 plugin cache 경로:
```bash
"~/.codex/plugins/cache/<marketplace>/<plugin>/<sha>/hooks/scripts/script.sh"
```

### 8. Hook handler 제한 (현재)

> "command 기반만 지원, prompt/agent 핸들러는 parse 되지만 skip"

→ deep-work hook 의 모든 command 형식이 호환됨.

### 9. Feature flag — `features.codex_hooks`

`~/.codex/config.toml` 에 추가 필요:
```toml
[features]
codex_hooks = true
multi_agent = true
```

→ AGENTS.md 의 Prerequisites 에 두 flag 모두 명시 필요.

### Phase B 영향

- `migrate-hooks.mjs` 의 stdin parser 룰: CC ↔ Codex 페이로드 호환 → 거의 그대로 적용
- `${CLAUDE_PLUGIN_ROOT}` → `$(git rev-parse --show-toplevel)/.codex/` 변환 룰 추가
- **First-Run Install Pattern (A')** — skill 본문에 hook 자동 설치 로직 통합 (skill_mcp_dependency_install 패턴 차용)

---

## OI-3: spawn_agent + wait + close_agent lifecycle + slot limit (Critical) — **RESOLVED**

### 핵심 발견

| 측정 | 결과 |
|---|---|
| **`spawn_agent()` 명시적 함수 API** | **❌ 부재** — 자연어 prompt 기반 |
| `spawn_agents_on_csv` experimental tool | ✓ 존재 (batch processing) |
| `agents.max_threads` 기본값 | **6** — B-α (parallel 3-way) 충분히 만족 |
| `/agent` CLI 관리 명령 | ✓ 지원 (steer, stop, close threads) |
| per-call `model` override | ❌ 미문서화 (B-α 결정 정합) |
| per-agent tool whitelist | ❌ 미문서화 (B-α 결정 정합) |
| Inter-subagent message passing | ❌ 미문서화 (B-α 결정 정합) |

### 시나리오 분기 (W-R4)

`agents.max_threads = 6` 이므로:
- N=6 ≥ 3 → **B-α 정상 진행** (deep-research 3-way + deep-implement Branch A 모두 동작)
- N=2 → 적용 안 됨 (max=6)
- N=1 → 적용 안 됨 (B-β 트리거 시나리오 미발생)

### Spec 변환 룰셋 영향

`lib/tool-mapping.json` 의 `subagent.Task`:
- ❌ 함수 호출 형식 (`spawn_agent(agent_type=..., message=...)`)
- ✅ **자연어 prompt 형식** ("Spawn N worker agents... wait... close")

→ 이미 plan 의 `parallel_pattern` 자연어 형식 — **fix 적음**.

### 측정 artifact (C-PA4)

```json
{
  "measurement_date": "2026-04-25",
  "codex_version": "(local 환경)",
  "config_multi_agent": "agents.max_threads default = 6",
  "slot_limit_measured": 6,
  "tested_up_to": "공식 문서 기준 (실제 인터랙티브 측정 미수행)",
  "first_failure_at": null,
  "first_failure_error": null,
  "transcript_paths": [],
  "lifecycle_close_agent_behavior": "/agent CLI 로 명시적 close, 미지정 시 thread 누적",
  "scenario": "N>=3 → B-alpha proceed (max_threads=6)"
}
```

### Phase B 영향

- `migrate-skills.mjs` 의 parallel block 변환: 이미 자연어 형식 (OK)
- `migrate-agents.mjs` 의 `Task → spawn_agent` 변환: 자연어 prompt 로 (OK)
- `/agent` CLI 관리 — implement-slice-worker 의 partial-timeout handling 자연어 변환 시 명시

---

## OI-7: ${CLAUDE_PLUGIN_ROOT} 대체값 (Critical) — **RESOLVED**

### 공식 권장 패턴

```bash
# Repo-local hook (대부분의 case)
"$(git rev-parse --show-toplevel)/.codex/hooks/script.py"

# Plugin-distributed hook (First-Run Install Pattern 후, 사용자 repo 의 .codex/ 로 복사됨)
# → 같은 패턴 사용
```

### 발견된 path 패턴

- relative path (`./scripts/...`): figma 사용 (CWD = session cwd, plugin root 아님 → 동작 안 함 가능성)
- envvar (`${VAR}`): plugin 별로 사용된 표준 envvar 부재
- abs path: 발견된 표준 envvar 부재

### Phase B 영향

`migrate-hooks.mjs` 의 `${CLAUDE_PLUGIN_ROOT}` 변환 룰:
- → `$(git rev-parse --show-toplevel)/.codex/hooks/scripts/<file>` (project hook)
- 또는 plugin cache 경로 (`~/.codex/plugins/cache/...`) — A' first-run install 시 cache 경로에서 user 의 `<repo>/.codex/` 로 copy

### 추가 발견 — `~/.claude/plugins/cache` HOME 경로

CC `phase-guard.sh:264,273,447` 의 `~/.claude/plugins/cache` 는 Codex 에서 `~/.codex/plugins/cache` 로 직접 매핑 가능:

```bash
# CC
PLUGIN_CACHE="${HOME}/.claude/plugins/cache"

# Codex
PLUGIN_CACHE="${HOME}/.codex/plugins/cache"
```

→ literal_replace 룰에 추가:
```json
"~/.claude/plugins/cache": "~/.codex/plugins/cache"
```

---

## OI-9: AGENTS.md 자동 로드 매커니즘 (Medium) — **RESOLVED**

### 핵심 발견

| 측정 | 결과 |
|---|---|
| AGENTS.md 자동 로드 | ✅ **자동 로드** ("Codex reads AGENTS.md files before doing any work") |
| plugin.json `contextFileName` 같은 필드 | ❌ **불필요** (필드 자체 부재) |
| 검색 경로 (precedence 낮음 → 높음) | `~/.codex/AGENTS.{override.md,md}` (글로벌) → git root (project) → 하위 디렉토리 (현재 cwd 까지) |
| **Plugin root 의 AGENTS.md 자동 로드** | ❓ **미명시** — Codex 가 plugin 디렉토리도 traverse 하는지 미확인 |
| Concatenation 방식 | root → 하위로 누적, 빈 줄로 join. 가까운 디렉토리가 우선. |
| 최대 크기 | 32 KiB (`project_doc_max_bytes` 로 조정) |

### Phase B 영향

- codex-deep-work plugin 의 `AGENTS.md` 가 **사용자 repo 에 자동 로드되지 않을 가능성 높음**
- → README 에 "Plugin install 후 user repo 의 AGENTS.md 에 plugin 안내 섹션 추가" 안내 필요 (또는 First-Run install pattern 에 통합)
- 또는 plugin scaffold 시 AGENTS.md 의 핵심 정보 (multi_agent + codex_hooks prerequisite, B-α scope) 를 자동 prepend 하는 install helper 제공

### 추가 발견 — `~/.codex/AGENTS.override.md` 사용 가능

사용자가 글로벌 override 로 plugin 의 AGENTS.md 를 명시적으로 link 가능. 이는 plugin install 시 옵션:
```markdown
# ~/.codex/AGENTS.md (또는 AGENTS.override.md)

## Active Plugins
- codex-deep-work: B-α scope, see `~/.codex/plugins/cache/.../AGENTS.md`
```

---

## OI-10: marketplace.json 위치 검증 (Low) — **RESOLVED**

### 검증 결과

```bash
$ find ~/.codex -name "marketplace.json" -type f
/Users/sungmin/.codex/.tmp/plugins/.agents/plugins/marketplace.json
/Users/sungmin/.codex/.tmp/bundled-marketplaces/openai-bundled/.agents/plugins/marketplace.json
```

→ **`<repo>/.agents/plugins/marketplace.json` 위치 확정** (spec Section 2-2 일관).

`codex-deep-suite` 레포의 `.agents/plugins/marketplace.json` 경로 OK.

---

## assumptions.json receipt 검증 강화 (부록 F #4) — **RESOLVED (Phase C, 2026-04-26)**

- spec line 484: "assumptions.json receipt 검증 룰 강화 — `tools_used` 필드 +
  `model_used` 필드 추가, agent 별 화이트리스트 위반을 사후 신호화."

- 적용:
  - `assumptions.json` 신규 생성 (vendor v6.4.0 의 6개 assumption 마이그레이션 +
    7번째 `post_hoc_tool_whitelist_enforcement` 추가). 이전엔 codex-deep-work
    레포에 부재 (vendor 만 보유).
  - `hooks/scripts/receipt-migration.js` V1_DEFAULTS 에 `tools_used: []` 추가.
    `model_used: 'unknown'` 은 이미 존재.
  - `hooks/scripts/file-tracker.sh` receipt 초기 생성에 `tools_used: []` +
    `model_used: ${MODEL:-unknown}` 필드 포함. parse_hook_stdin 가 envelope
    `.model` 에서 추출한 `MODEL` env 활용.
  - `hooks/scripts/file-tracker.sh` 갱신 단계에 `tools_used` dedup-append 로직
    추가 — TOOL_NAME 인자 추가 (lock 보호된 update 블록 안에서).
  - `hooks/scripts/receipt-migration.test.js` 에 2 신규 테스트 (default value +
    pre-existing 보존).

- 후속 (Phase D 또는 별도 commit):
  - `hooks/scripts/verify-receipt-core.js` 가 `tools_used` 배열을 agent 의
    자연어 tools 가이드와 대조하는 actual validation 로직. 현재는 receipt
    schema 갖추는 단계만 — validation 의 정확한 알고리즘 (regex / NLP / agents
    yaml lookup) 은 별도 설계 필요.
  - agent .md 본문의 자연어 tools 가이드 표준화 ("You may only use Read/Grep
    tools — do not run Bash") 가 verify 알고리즘의 input.

- 검증: ALL CHECKS PASS, 1314/1178/136 (1단계 baseline 1312 → +2 신규 receipt
  tests + 0 회귀).

---

## Plan-Patch-7 Phase-C TODO (부록 F #6) — **RESOLVED (Phase C, 2026-04-26)**

- migrate-hooks.mjs `injectStdinParser` 가 vendor 의 pre-existing `$(cat)` 가
  있는 hook 스크립트에는 stdin double-consumption 회피 위해 자동 inject skip
  → `# TODO(Phase-C)` 마커 잔존.

- 검증 후 Codex 환경 부정합 발견:
  - vendor `TOOL_INPUT="$(cat)"` 가 stdin envelope 통째로 읽음
    (Codex 도 envelope 형식: `{tool_name, tool_input, hook_event_name, ...}`)
  - 그러나 vendor 의 downstream `extract_file_path_from_json "$TOOL_INPUT"` 은
    inner `{file_path: ...}` 만 기대 → empty 반환 (broken in Codex)
  - vendor `TOOL_NAME="${CLAUDE_TOOL_USE_TOOL_NAME:-...}"` env-var fallback 도
    Codex 환경에선 미설정 → empty
  - phase-transition.sh 의 cache read 도 envelope 받아서 file_path 추출 실패

- 정정 (3 사이트 통합):
  - `hooks/scripts/file-tracker.sh:28-29` (1 사이트): `$(cat) + env-var` → `parse_hook_stdin`
  - `hooks/scripts/phase-guard.sh:104-105` (PHASE5 분기): 동일 — 단 `_P5_INPUT`/`_P5_TOOL` 변수명 보존 (parser-set TOOL_INPUT/TOOL_NAME 으로부터 할당)
  - `hooks/scripts/phase-guard.sh:545-546` (정상 분기): 동일
  - 두 분기 mutually exclusive (PHASE5_MODE → branch 1 + exit, else → branch 2) 라 stdin 한번씩 읽힘
  - `parse_hook_stdin` 함수가 envelope JSON 파싱 + TOOL_NAME/TOOL_INPUT/HOOK_EVENT/SESSION_ID/TURN_ID/MODEL 설정 + 5 backward-compat env aliases export

- 부수 발견:
  - file-tracker.sh 의 cache 가 이제 envelope 대신 inner tool_input 만 저장 →
    phase-transition.sh 의 cache-read 시 extract_file_path_from_json 정상 동작
    (이전엔 envelope 읽어 fail 하는 pre-existing bug)
  - file-tracker-fixes.test.js 의 4 stdin cache 테스트가 vendor 식 non-envelope
    fixture 사용 → envelope format 으로 갱신 (production 일치)

- 잔존 TODO(Phase-C) 마커 2건:
  - `hooks/scripts/input-parsing-e2e.test.js:2` (Plan-Patch-22 multi-level nesting fixture, 부록 F #9 영역)
  - `hooks/scripts/phase-guard-hardening.test.js:2` (동일)

- 검증: verify-migration.sh ALL CHECKS PASS, 1312 tests / 1176 pass / 136 fail
  베이스라인 유지 (신규 회귀 0).

---

## SendMessage 패턴 1 vs 2 분류 (부록 F #1) — **RESOLVED (Phase C, 2026-04-26)**

- spec Section 3-6 line 478-479 의 두 패턴 분리 정의:
  - Pattern 1 (parallel aggregation): N worker 동시 + main aggregate. B-α 보존.
  - Pattern 2 (sequential chain + 양방향 receipt): team namespace + 양방향 메시지. B-α 에서 sequential chain (spec→test→impl) 으로 축소 의도.

- 검증 결과:
  - **Pattern 1**: deep-implement SKILL.md Branch B (line 363-380) 가 `Agent` N parallel + main receipt aggregate 로 정확 보존 ✓
  - **Pattern 2**: deep-implement SKILL.md Branch A (line 331-359) 가 deadwood 처리 — spec 의 "sequential chain 변환" 옵션 미적용
  - **이유**: v6.4.0 의 `implement-slice-worker` agent 본문에 SendMessage 0건 — worker-to-worker 양방향 통신 부재 (receipt-file 기반) → sequential chain 변환 불필요
  - **결과**: env_var 활성 시 Branch B (pattern 1) 로 fall-through. spec ↔ skill 의식적 결정 차이를 deadwood marker 에 명시.
  - commands/*.md frontmatter 의 `allowed-tools: ... SendMessage` 잔존은 spec line 208 ("frontmatter 유지") 의도와 일치 ✓
  - AGENTS.md line 51-52 의 mapping table 은 spec 의 분류와 일치 ✓
  - agents/implement-slice-worker.md SendMessage 0건 ✓

- 변경 commit: (Phase C resume 세션, deep-implement SKILL.md Branch A deadwood marker 보강)

---

## OI-2: update_plan 시그니처 (Medium) — **RESOLVED (Phase C, 2026-04-26)**

- 처리 정책: spec line 617 ("Medium / deep-implement skill 마이그레이션 시") 따름
- Phase A 에서는 검증/측정 안 함
- Phase C 부록 F #5 검증 (2026-04-26):
  - skills/deep-implement/SKILL.md 에서 `update_plan` 참조 1건 발견 (Branch A pseudo-code, line 341)
  - 검증 결과: 잘못된 vocabulary — `subject`/`description` (TaskCreate 필드) 를 `update_plan` 에 사용
  - 정정: Codex `update_plan({plan: [{step, status}]})` 시그니처에 맞게 step 단일 필드로 통합 + status enum (pending/in_progress/completed) 명시
  - 추가 발견: Branch A 전체가 B-α 미지원 (TeamCreate/SendMessage/TeamDelete 모두 미지원) → deadwood 마커 추가
  - skills/deep-research/SKILL.md:170 의 `update_plan` 참조는 historical (제거된 분기) — fix 불필요
- 변경 commit: (Phase C resume 세션)

---

## OI-4: multi_agent prerequisite 안내 (Medium) — **RESOLVED + 확장**

### plugin.json 검증

`interface.longDescription` + `interface.defaultPrompt` 에 multi_agent prerequisite 명시 (Task 1 step 2 완료) ✓

### AGENTS.md 검증

`AGENTS.md` Prerequisites 섹션에 toml 예시 포함 (Task 1 step 3 완료) ✓

### **확장 발견**: `features.codex_hooks` 도 prerequisite

OI-1 검증 중 발견 — Codex hook 시스템이 feature flag 로 토글됨. **plugin.json + AGENTS.md 둘 다 codex_hooks 추가 필요**.

추가할 prerequisite:
```toml
[features]
multi_agent = true
codex_hooks = true   # NEW
```

→ Task 6 의 spec 갱신 시 plugin.json `interface.longDescription` + AGENTS.md `Prerequisites` 모두 갱신 필요.

### install hook 가능성 — **부재 (Codex 미지원)**

조사 결과:
- `codex plugin install` 명령어 자체 부재 (marketplace add/upgrade/remove 만)
- plugin.json 에 install/postinstall/onInstall/lifecycle 필드 0건 (140 plugin 검사)
- → install-time 자동 prompt 불가
- 대안: **First-Run Install Pattern (A')** — skill 본문에 첫 실행 시 prerequisite check 로직 (skill_mcp_dependency_install 패턴 차용)

---

## OI-5: extensions vs plugin 서브커맨드 (Medium) — **RESOLVED**

### 검증 결과

```bash
$ codex --help | grep -iE "extensions|plugin"
plugin       Manage Codex plugins

$ codex extensions --help 2>&1
error: unrecognized subcommand 'extensions'
```

→ **`codex extensions` 명령어 부재**. `codex plugin marketplace add/upgrade/remove` 만 존재.

### 전체 plugin 명령 목록

```bash
codex plugin marketplace add <url>     # 마켓플레이스 등록
codex plugin marketplace upgrade        # 업그레이드
codex plugin marketplace remove <name>  # 제거
```

→ **별도 install 명령 없음** — marketplace add 시 자동 install (cache 로 fetch).

### Phase B 영향 — spec 정정 필요

spec 의 다음 위치 정정:
- Section 4-4 (CI): `codex plugin validate .` 또는 `codex extensions validate` → **`codex plugin marketplace add`** 만 사용
- Section 5-2 (Release): `codex plugin marketplace add ...` 또는 `upgrade`
- Section 5-5 (DoD): `codex extensions link` → **`codex plugin marketplace add file://./codex-deep-work` 또는 git URL**

---

## OI-11: A' First-Run Install Pattern 구현 (Critical, NEW) — DEFERRED to Phase B/C

### 발견 경위

OI-1/OI-4 검증 중 plugin 의 hooks.json 자동 인식 부재 + Codex install-time hook 메커니즘 부재로 신설.

### 구현 옵션

- **(A) Phase B step 9** (`migrate-skills.mjs`) — 모든 phase skill 본문에 first-run check 자동 prepend
- **(B) Phase C step 15** — `deep-work-orchestrator` skill 한 곳에만 수동 통합 (entry point 단일 책임)
- **권장: (B)** — install 책임을 단일 entry point 에 집중, 다른 skill 들은 hook 존재 가정

### 구현 명세 (Phase B/C 시점에 본 섹션 참조)

`deep-work-orchestrator` skill 본문 첫 단계에 prepend:

```markdown
## First-Run Hook Install Check (OI-11)

Before proceeding, check if `<repo>/.codex/hooks.json` exists.

If absent:
1. Display the contents of `<plugin-cache>/hooks-template.json` to the user
2. Ask: "deep-work plugin uses Codex hooks for TDD enforcement and receipt validation. Install hooks into <repo>/.codex/hooks.json now?"
3. On Y → merge install (preserving any existing hooks)
4. On N → set `.codex/deep-work/no-hook-mode` flag → degrade to natural-language fallback (post-hoc receipt validation)
5. Record decision in `assumptions.json.first_run_install_completed`
```

### Phase B 영향

- `migrate-skills.mjs` 의 deep-work-orchestrator 변환 시 install prompt 코드 prepend 룰 추가
- `assumptions.json` 에 `first_run_install_completed: bool` + `hooks_install_decision: yes|no|deferred` 필드 추가
- plugin scaffold 에 `hooks-template.json` 동봉 (Phase B step 11 hooks.json 생성과 동시)

### Phase C 영향 (Branch B 권장 시)

- Phase C step 15 (사람 검토) 시점에 deep-work-orchestrator 의 first-run 로직 직접 작성
- 다른 phase skill 은 변경 없음
- A' 거절 시 fallback: `.codex/deep-work/no-hook-mode` flag 검사 → 모든 hook-dependent 검증을 자연어 가이드로 대체

---

## OI-8: per-agent tool 제약 재현 방법 (Medium) — **RESOLVED**

### 조사 결과

```bash
$ grep -iE "sandbox|permission|tool|whitelist|allowed_tools" ~/.codex/config.toml
# (no match)

$ find ~/.codex -name "plugin.json" -exec jq 'keys[]' {} \; | sort -u
# 'agents' 필드 부재 — per-agent tools 정식 메커니즘 없음
```

### 결정: **(C) 메커니즘 없음 → spec 현행 유지**

옵션:
- (A) plugin.json 에 agents 필드 추가 — **부재**
- (B) sandbox 옵션 — config.toml 에 관련 키 부재
- (C) **메커니즘 없음** — spec 현행 (자연어 가이드 + post-hoc receipt validation)

### Phase B 영향

spec Section 3-6 의 per-agent tools 행 "회복 시점" 갱신 불필요 (그대로 v0.2+ Codex 추가 시).

assumptions.json 의 receipt 검증 룰 강화 (Task 6 / Phase B step 17):
- `tools_used` 필드 추가 (hook-derived, OI-1 의 PostToolUse 로 자동 기록)
- `model_used` 필드 추가
- agent 별 자연어 가이드 위반 시 receipt 에 신호 (Phase C step 14 의 사람 검토 단계와 정합)

---

## 종합 요약 — Phase B 진입 가능 상태

### Critical OI 5건

| OI | 상태 | Phase B 영향 |
|---|---|---|
| OI-1 | ✅ RESOLVED — A' First-Run Install Pattern | hook 변환 OK + skill 본문에 install 로직 통합 |
| OI-3 | ✅ RESOLVED — slot=6, 자연어 변환 | parallel block 자연어 변환 (이미 plan 적용) |
| OI-7 | ✅ RESOLVED — git root + plugin cache 경로 | `${CLAUDE_PLUGIN_ROOT}` 변환 룰 확정 |
| OI-9 | ✅ RESOLVED — AGENTS.md 자동 로드 (plugin root 미확인) | README 에 사용자 repo AGENTS.md 안내 |
| OI-10 | ✅ RESOLVED — `.agents/plugins/marketplace.json` | 변경 없음 |

### Medium OI 4건

| OI | 상태 | Phase B 영향 |
|---|---|---|
| OI-2 | ✅ RESOLVED (Phase C 부록 F #5, 2026-04-26) | deep-implement SKILL.md 의 `update_plan` 호출 정정 + Branch A B-α 미지원 마커 |
| OI-4 | ✅ RESOLVED + 확장 (codex_hooks 추가) | plugin.json + AGENTS.md 갱신 (multi_agent + codex_hooks) |
| OI-5 | ✅ RESOLVED — `codex plugin marketplace add` | spec Section 4-4/5-2/5-5 명령어 정정 |
| OI-8 | ✅ RESOLVED — 메커니즘 부재, spec 현행 | assumptions.json 강화 (Phase B step 17) |

### Phase B 진입 차단 게이트 — **모두 통과**

1. ✅ `slot_limit_measured` = 6 (정수, ≥3)
2. ✅ `path-mapping.json` 의 `state_path_replace` 룰 read/write 분류 명시 (Task 3 완료)
3. ✅ `verify-migration.sh` 에 raw `.codex/deep-work/` 직접 접근 fail 룰 → Phase B 에서 구현 (verify_rule 정의 완료)

### Spec 갱신 필요 위치 (Task 6 에서 처리)

- Section 0 (결정 2): codex_hooks prerequisite 추가
- Section 2-1 (plugin.json): longDescription + defaultPrompt 에 codex_hooks 명시
- Section 2-3 (AGENTS.md): Prerequisites toml 예시에 codex_hooks 추가
- Section 2-4: hooks/hooks.json 행 강도 — "**중**" 유지하되 "First-Run Install Pattern 통한 사용자 repo 로 install" 명시
- Section 3-2 (path mapping): `${CLAUDE_PLUGIN_ROOT}` 대체값 = `$(git rev-parse --show-toplevel)/.codex/...` 확정
- Section 3-4 (Hook 페이로드): stdin 스키마 6 events + model/turn_id 추가
- Section 4-4 (CI): `codex plugin marketplace add` 사용
- Section 5-2 (Release): `codex plugin marketplace add` 사용
- Section 5-3 (OI 표): 9개 OI 모두 ✅/⏸ 표시 + 결과 요약
- Section 5-5 (DoD): hot path 명령어 정정
- Section 5-6 (후속 로드맵): Codex 가 plugin hooks 자동 인식 / per-agent tools 추가 시 점진 이식 명시

### 새 부록 (Task 6 에서 신설)

`spec` 부록 E (Phase A 결과) — 본 oi-results.md 의 요약 + 영향받은 spec section 매핑.
