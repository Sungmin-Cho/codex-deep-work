# Changelog

## Unreleased — Phase A complete (2026-04-25)

- Phase A scaffold complete: plugin.json + AGENTS.md + scripts/migrate-from-claude/ + lib JSON rules + vendor copy + test baseline (600)
- 10 OI processed (Critical 5 RESOLVED + Medium 3 RESOLVED + OI-2 DEFERRED + OI-11 NEW DEFERRED)
- Phase B 진입 가능 상태

## 0.1.0 — TBD (Phase E release)

First release planned — Codex CLI port of claude-deep-work v6.4.0 (B-α scope).

- 5-phase auto-flow (Brainstorm → Research → Plan → Implement → Test) preserved
- parallel `spawn_agent` dispatch via `multi_agent` feature flag
- per-file legacy state import (`.claude/` → `.codex/`)
- Semantic losses documented in `AGENTS.md` (per-call model override, per-agent tool whitelist, AskUserQuestion structured options, TeamCreate/SendMessage primitives)
