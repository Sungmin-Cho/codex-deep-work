# codex-deep-work

Evidence-Driven Development Protocol — Codex CLI plugin port of [claude-deep-work v6.4.0](https://github.com/Sungmin-Cho/claude-deep-work).

**Scope:** B-α — parallel `spawn_agent` dispatch only. See Semantic Losses in `AGENTS.md`.

## Install (v0.1.0 release 후 — Phase E 완료 시점)

```bash
codex plugin marketplace add https://github.com/Sungmin-Cho/codex-deep-suite
# marketplace add 시 자동 install (cache fetch). 별도 install 명령 부재.
```

> **현재 상태**: B-α 스코프 마이그레이션 진행 중 (Phase A 완료, Phase B 대기). 위 명령은 v0.1.0 release 후 동작.

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
