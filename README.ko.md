# codex-deep-work

증거 기반 개발 프로토콜 — [claude-deep-work v6.4.0](https://github.com/Sungmin-Cho/claude-deep-work) 의 Codex CLI 플러그인 포팅.

**스코프:** B-α — parallel `spawn_agent` 디스패치만. `AGENTS.md` 의 Semantic Losses 참조.

## 설치

```bash
codex plugin marketplace add https://github.com/Sungmin-Cho/codex-deep-suite
codex plugin install deep-work
```

## 사용법

```
/deep-work "작업 설명"
```

5단계 auto-flow 실행: Brainstorm → Research → Plan → Implement → Test.

## 요구사항

- Codex CLI + `multi_agent` feature flag (`AGENTS.md` 참조)
- Node.js (hook 스크립트 + 마이그레이션 도구)
- macOS / Linux (Windows 미검증)

## License

MIT
