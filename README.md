# codex-deep-work

Evidence-Driven Development Protocol — Codex CLI plugin port of [claude-deep-work v6.4.0](https://github.com/Sungmin-Cho/claude-deep-work).

**Scope:** B-α — parallel `spawn_agent` dispatch only. See Semantic Losses in `AGENTS.md`.

## Install

```bash
codex plugin marketplace add https://github.com/Sungmin-Cho/codex-deep-suite
codex plugin install deep-work
```

## Usage

```
/deep-work "your task description"
```

Drives 5-phase auto-flow: Brainstorm → Research → Plan → Implement → Test.

## Requirements

- Codex CLI with `multi_agent` feature flag enabled (see `AGENTS.md`)
- Node.js (for hook scripts and migration tooling)
- macOS or Linux (Windows untested)

## License

MIT
