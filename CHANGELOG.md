# Changelog

## 0.1.0 — 2026-04-XX (planned)

First release — Codex CLI port of claude-deep-work v6.4.0 (B-α scope).

- 5-phase auto-flow (Brainstorm → Research → Plan → Implement → Test) preserved
- parallel `spawn_agent` dispatch via `multi_agent` feature flag
- per-file legacy state import (`.claude/` → `.codex/`)
- Semantic losses documented in `AGENTS.md` (per-call model override, per-agent tool whitelist, AskUserQuestion structured options, TeamCreate/SendMessage primitives)
