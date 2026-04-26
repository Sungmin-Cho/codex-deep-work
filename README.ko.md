# codex-deep-work

증거 기반 개발 프로토콜 — [claude-deep-work v6.4.1](https://github.com/Sungmin-Cho/claude-deep-work) 의 Codex CLI 플러그인 포팅.

**스코프:** B-α — parallel `spawn_agent` 디스패치만. `AGENTS.md` 의 Semantic Losses 참조.

## 설치 (v0.1.0 release 후 — Phase E 완료 시점)

```bash
codex plugin marketplace add https://github.com/Sungmin-Cho/codex-deep-suite
# marketplace add 시 자동 install (cache fetch). 별도 install 명령 부재.
```

> **현재 상태 (2026-04-26)**: Phase A + B + C 완료 (부록 F 11/11), Phase D 진입 + 본 deep-review 응답 (`/deep-review 2026-04-26-152137`) 7 critical fix 흡수. 다음: Phase E (릴리스 준비). 위 명령은 릴리스 후 동작.

> **Pre-release 검증**: `bash scripts/migrate-from-claude/verify-migration.sh` 로 마이그레이션 게이트 확인. Phase B/C 진행 상황은 `CHANGELOG.ko.md` 참조.

## 사용법

```
/deep-work "작업 설명"
```

6단계 auto-flow 실행: Brainstorm → Research → Plan → Implement → Test → Integrate.

## 요구사항

- Codex CLI + `multi_agent` + `codex_hooks` feature flags **모두** 활성화 필요 (`AGENTS.md` 참조)
- Node.js (hook 스크립트 + 마이그레이션 도구)
- macOS / Linux (Windows 미검증)
- 첫 `/deep-work` 실행 시 사용자 repo 의 `.codex/hooks.json` 자동 install prompt

## License

MIT
