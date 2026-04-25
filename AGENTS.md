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

(Section 3-1 of spec — to be filled by migrate-context-doc.mjs in Phase B)

## Semantic Losses (B-α)

(Section 3-6 of spec — to be filled by migrate-context-doc.mjs in Phase B)

## State Namespace

- Runtime state under `.codex/deep-work/` and `.codex/deep-work.<SESSION>.md`
- Legacy `.claude/` paths read-only via `read_state_file()` (per-file import on first read)
- `.claude/` files never written by Codex

## Test Suite

- `node --test` from repo root
- baseline count frozen in `tests/.baseline-count` (Phase A snapshot, 600 tests on Node v22)
