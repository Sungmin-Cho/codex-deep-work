# Changelog

## Unreleased — Phase C complete + Phase D 진입 (2026-04-26)

### Phase E pre-flight (2026-04-26)

- Removed active hook runtime dependence on process substitution (`/dev/fd`) in `file-tracker.sh`, `phase-guard.sh`, and `session-end.sh`; stderr is now captured through temp files and appended via the `.codex/` state API.
- Updated `file-tracker` marker-flip tests to use Codex envelope stdin and `.codex/` write-target state files, matching the Phase C legacy import contract.
- Lowered `tests/.expected-fail-count` from 136 to 133 after the deterministic hook portability failures were fixed.
- Restored deep-integrate runtime scripts (`detect-plugins.sh`, `gather-signals.sh`) and v6.4.0 integration fixtures, removed invalid HTML migration markers from JSON fixtures/schemas, and taught the migration marker helper to leave `.json` content unmodified. Test baseline is now 1322 with expected fails lowered to 97.
- Review follow-up: removed the remaining `gather-signals.sh` process substitutions, added coverage for `.codex` primary-state reads without legacy import, and renamed negative fixture headings to match their expected failure modes.

### Phase D 진입 + deep-review round 2/3 응답 (2026-04-26 후반)

- **/deep-review 2026-04-26-152137 (3-way)**: 7 critical + 5 W/I 흡수 (commit `b0b30ad`).
  - C1 update-check.sh source utils.sh — silent regression 해결
  - C2 utils.sh:262 .claude/ mkdir 제거 — spec 일치
  - C3 init_deep_work_state legacy fallback (round 2 C3-broken: `validate_legacy_schema` 의 default case 가 bare scalar pointer reject 했던 것 fix — `^[A-Za-z0-9_-]{3,128}$` 패턴 추가)
  - C4 phase-guard Phase 5 plugin cache `.codex/` 우선 + `.claude/` fallback
  - C5 verify-migration pass/fail check + `.expected-fail-count = 136` baseline
  - C6 file-tracker pending sidecar tool_name 보존
  - C7 commands frontmatter unsupported tools 정리 + update_plan
- **/deep-review 2026-04-26-155058 (1-way Opus, Codex timeout)**: round 2 — C3 broken + W3 incomplete + 4 warning 흡수.

### Phase C 부록 F (11/11 완료)

- **#5 OI-2** `update_plan` 시그니처 검증: deep-implement Branch A pseudo-code 의 `subject`/`description` (TaskCreate 필드) 잘못된 사용 → `{plan: [{step, status}]}` 시그니처 정정.
- **#1 SendMessage pattern 분류 검증**: pattern 1 (parallel aggregation) Branch B 보존 ✓; pattern 2 (양방향 receipt) deadwood 명시 (worker SendMessage 0건이라 sequential chain 변환 불필요).

- **#5 OI-2** `update_plan` 시그니처 검증: deep-implement Branch A pseudo-code 의 `subject`/`description` (TaskCreate 필드) 잘못된 사용 → `{plan: [{step, status}]}` 시그니처 정정.
- **#1 SendMessage pattern 분류 검증**: pattern 1 (parallel aggregation) Branch B 보존 ✓; pattern 2 (양방향 receipt) deadwood 명시 (worker SendMessage 0건이라 sequential chain 변환 불필요).
- **#6 Plan-Patch-7 stdin parser 통합**: vendor `$(cat)` 3 사이트 (file-tracker / phase-guard 2곳) 를 `parse_hook_stdin` 호출로 교체. envelope 파싱 + 5 backward-compat env aliases 일관 적용.
- **#11 spec Section 3-1/3-2/3-3/3-6 표 정정**: Phase B/C 결과 반영 (OI-2 RESOLVED, OI-7 plugin cache 중복 행 제거, SendMessage pattern 2 deadwood 명시, env var alias 보존).
- **#4 assumptions.json receipt 검증 강화**: vendor 6 assumption + 7번째 `post_hoc_tool_whitelist_enforcement` 추가. receipt schema 에 `tools_used: []` + `model_used` 필드.
- **#7 ambiguous state path TODO**: verification only — Phase B Plan-Patch-5 가 모든 vendor quoted bare path 분류 → 실제 마커 0건.
- **#9 multi-level nesting fixture**: TODO(Phase-C) 마커 2건 envelope format 으로 마이그레이션. 전체 TODO(Phase-C) 마커 0건.
- **#2 AGENTS.md 한·영 손질**: 자연어 다듬기 + Phase C 결과 반영 (SendMessage pattern 2 deadwood / parse_hook_stdin env aliases / Receipt 검증 섹션 추가).
- **#8 indirect 변수 refactoring**: `_PTR` / `NODE_ERR_LOG` / `PROFILE_FILE` 등 9 사이트 → `read_state_file` / `write_state_file` / process substitution 전환. verify-migration **check 4 strict mode 100% PASS**.

### Phase C deep-review 대응 (2026-04-26)

3-way deep-review (Opus + Codex review + Codex adversarial) REQUEST_CHANGES 5 항목 흡수:
- **C1**: `path-mapping.json` broad mapping → narrow mapping (transform order 보존, marker dual-search 방어)
- **C2**: cache path 마이그레이션 후 stale test fixtures 3 파일 동기화
- **W1**: Plan-Patch-39 test fixture 회귀 차단 효력 회복
- **W2**: `bash -n` 한계 명시 (POSIX `[ ... || ... ]` runtime error 검출 못함)
- **I3**: migrate-paths.mjs 코멘트 보강

### Phase B 자동 fix (2026-04-25)

- 5차 W5: allowlist 파일명 ASCII 리네임 (`bα` → `b-alpha`, Windows / npm tarball 호환)
- 5차 W7: `package.json` keywords 보강 (evidence-driven, tdd) + LICENSE files 명시
- 7차 W4: vendor hooks `.claude/` 캐시 path → `.codex/` (3 파일 + migrate-paths 매핑)
- 7차 W5: Plan-Patch-38~41 회귀 테스트 13건 (Plan-Patch-38 dual-search, Plan-Patch-39 inject 분리, Plan-Patch-40 BASH_SOURCE[0], Plan-Patch-41 POSIX -o operator)

## Unreleased — Phase A complete (2026-04-25)

- Phase A scaffold complete: plugin.json + AGENTS.md + scripts/migrate-from-claude/ + lib JSON rules + vendor copy + test baseline (600)
- 10 OI processed (Critical 5 RESOLVED + Medium 3 RESOLVED + OI-2 DEFERRED + OI-11 NEW DEFERRED)
- Phase B 진입 가능 상태

## 0.1.0 — TBD (Phase E release)

First release planned — Codex CLI port of claude-deep-work v6.4.0 (B-α scope).

### Highlights

- 5-phase auto-flow (Brainstorm → Research → Plan → Implement → Test) preserved
- Parallel `spawn_agent` dispatch via `multi_agent` feature flag
- Per-file legacy state import (`.claude/` → `.codex/`) — read-only fallback
- Receipt schema with `tools_used` + `model_used` for post-hoc tool whitelist enforcement (Codex 가 plugin-level whitelist 미지원이라 사후 신호화)
- Hook integration: phase-guard / file-tracker / phase-transition / session-end (4 hooks via `parse_hook_stdin`)
- Migration tooling (`scripts/migrate-from-claude/`) for vendor v6.4.0 → v0.1.0

### Semantic Losses (vs CC v6.4.0, see `AGENTS.md` for details)

- Per-call `model` override (`Agent(model=...)`) — Codex `spawn_agent` 미지원
- Per-agent `tools` whitelist (frontmatter) — plugin-level enforcement 부재 → 자연어 가이드 + post-hoc receipt validation
- `AskUserQuestion` structured options (`header`, `multiSelect`) — 자연어 번호 매김 prompt
- `TeamCreate` / `TeamDelete` / `TeamGet` — B-α 미지원 (자연어 fallback)
- `SendMessage` pattern 1 (parallel aggregation) — **B-α 보존** (`spawn_agent` N + `wait` N)
- `SendMessage` pattern 2 (sequential chain + 양방향 receipt) — **deadwood** (Branch A 전체 미지원, env_var 활성 시 Branch B fall-through)
- `NotebookEdit` — `Write` fallback
- Hook `CLAUDE_TOOL_USE_*` env var fallback — stdin JSON envelope 우선, alias 만 backward-compat 으로 export

### Migration Path

CC 사용자가 본 plugin 으로 전환 시:
1. `~/.codex/config.toml` 에 `multi_agent = true` + `codex_hooks = true` 활성화
2. `codex plugin marketplace add` 로 plugin 설치
3. 첫 `/deep-work` 실행 시 hook 자동 install prompt
4. Legacy `.claude/deep-work.*.md` 세션 파일은 read-only 로 `.codex/` 에 자동 import (per-file resolution, validate_legacy_schema 통과 시)

자세한 마이그레이션 가이드는 `scripts/migrate-from-claude/README.md` 참조.
