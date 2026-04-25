# AGENTS.md — codex-deep-work

> Codex CLI auto-load context for this plugin. **B-α scope** — see Semantic Losses section.

## Prerequisites

- Codex `multi_agent` feature flag must be enabled. In `~/.codex/config.toml`:
  ```toml
  [features]
  multi_agent = true
  ```
- Without this flag, parallel subagent dispatch (deep-research, deep-implement worker分기) will fall back to sequential or fail.

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
