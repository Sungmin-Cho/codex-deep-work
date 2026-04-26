# Migration Tooling — claude-deep-work → codex-deep-work

Forked from `gemini-deep-suite/scripts/`. Adapted for Codex CLI under B-α scope.

## Scripts

| Script | Purpose | Status (Phase A) |
|---|---|---|
| `extract-cc-hardcodes.sh` | Catalog `.claude/` literals + `CLAUDE_*` env vars | forked, ready |
| `migrate-manifest.mjs` | plugin.json + package.json files | stub (Phase B) |
| `migrate-paths.mjs` | `.claude/` → `read_state_file`/`write_state_file` codemod | stub (Phase B) |
| `migrate-skills.mjs` | skill body tool mapping (lib JSON source-of-truth) | **stub (Phase B)** — Gemini fork 제거됨 (deep-review C-CodexFork) |
| `migrate-commands.mjs` | commands/*.md tool mapping | stub (Phase B) |
| `migrate-agents.mjs` | agents/*.md + Task → spawn_agent natural language | stub (Phase B) |
| `migrate-hooks.mjs` | hooks.json + scripts (stdin parser injection) | **stub (Phase B)** — Gemini fork 제거됨 (deep-review C-CodexFork) |
| `migrate-fixtures.mjs` | test fixture stdin envelope (AST level) | stub (Phase B) |
| `migrate-context-doc.mjs` | CLAUDE.md → AGENTS.md (Semantic losses auto-insert) | stub (Phase B) |
| `count-tests.mjs` | Neutral test counter (Phase D CI 비교 기준) | stub (Phase D) |
| `verify-migration.sh` | Allowlist-based regression gate | stub (Phase B) |

## Rule sets (lib/)

- `tool-mapping.json` — B-α tool conversion rules
- `path-mapping.json` — `.claude/` state path rules (read/write classification, **not literal_replace** per C-PA1)
- `allowlist-claude-fallback.json` — `.claude/` literal allowed paths (utils.sh, fallback code)
- `allowlist-b-alpha-tokens.json` — Markdown educational token allowlist (Section 3-6 tables, AGENTS.md Semantic losses). Filename uses ASCII transliteration of `bα` for Windows tooling / npm tarball compatibility (5차 W5).
- `transformers.mjs` — AST/regex helpers

## Idempotency policy

Files modified by these scripts get the marker `<!-- migrated-by: codex-migrate v0.1 -->`. Re-running skips marked files unless `--force`.

**User-edited files are preserved** — once a file has the marker, manual edits are not overwritten on re-run. Use `--force` to override.

## Run order (Phase B)

1. `migrate-manifest.mjs`
2. `migrate-paths.mjs`
3. `migrate-skills.mjs`
4. `migrate-commands.mjs`
5. `migrate-hooks.mjs` (after OI-1/OI-7 resolved)
6. `migrate-fixtures.mjs`
7. `migrate-agents.mjs` (then human review)
8. `migrate-context-doc.mjs`
9. `verify-migration.sh`
