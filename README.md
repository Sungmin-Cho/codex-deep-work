# codex-deep-work

Evidence-Driven Development Protocol — Codex CLI plugin port of [claude-deep-work v6.4.0](https://github.com/Sungmin-Cho/claude-deep-work).

**Scope:** B-α — parallel `spawn_agent` dispatch only. See Semantic Losses in `AGENTS.md`.

## Install (v0.1.0 release 후 — Phase E 완료 시점)

```bash
codex plugin marketplace add https://github.com/Sungmin-Cho/codex-deep-suite
# marketplace add 시 자동 install (cache fetch). 별도 install 명령 부재.
```

> **현재 상태 (2026-04-26)**: Phase A + B 완료, Phase C 부록 F 8/11 진행 중. Phase D + E 후 v0.1.0 release. 위 명령은 release 후 동작.

> **Pre-release 검증**: `bash scripts/migrate-from-claude/verify-migration.sh` 로 마이그레이션 게이트 확인. Phase B/C 진행 상황은 `CHANGELOG.md` 참조.

## Usage

```
/deep-work "your task description"
```

Drives 5-phase auto-flow: Brainstorm → Research → Plan → Implement → Test.

## Requirements

- Codex CLI with `multi_agent` + `codex_hooks` feature flags **both** enabled (see `AGENTS.md`)
- Node.js (for hook scripts and migration tooling)
- macOS or Linux (Windows untested)
- First `/deep-work` run will prompt to install hooks into `<repo>/.codex/hooks.json`

## License

MIT
