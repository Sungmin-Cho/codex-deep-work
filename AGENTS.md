# AGENTS.md - codex-deep-work

This repository contains the Codex CLI port of **claude-deep-work v6.4.1**.
It packages the Evidence-Driven Development Protocol as a Codex plugin with
commands, skills, hooks, sensors, health checks, and migration tooling.

## Quick Orientation

- Plugin name: `deep-work`
- Package repo: `Sungmin-Cho/codex-deep-work`
- Suite marketplace repo: `Sungmin-Cho/codex-deep-suite`
- Plugin manifest: `.codex-plugin/plugin.json`
- Main entrypoint: `/deep-work "task description"`
- Test command: `npm test`
- Current migration scope: **B-alpha**. The port preserves the user-facing
  workflow where Codex has equivalent primitives, and documents weaker areas
  where Codex does not yet expose the same enforcement surface as Claude Code.

## Contents

1. Runtime Requirements
2. Repository Map
3. Workflow Surface
4. Hook And State Model
5. B-alpha Compatibility Notes
6. Migration Tooling
7. Verification Checklist
8. Maintenance Rules

## Runtime Requirements

The plugin expects these Codex feature flags in `~/.codex/config.toml`:

```toml
[features]
multi_agent = true
codex_hooks = true
```

- `multi_agent` enables parallel `spawn_agent` dispatch for research and
  implementation workers.
- `codex_hooks` enables phase guards, file tracking, sensor triggering, and
  receipt collection.
- Without these flags, the workflow degrades to natural-language guidance and
  post-hoc validation.

On first use, `/deep-work` should prompt to install hook definitions from
`hooks/hooks-template.json` into the user's target repository at
`<repo>/.codex/hooks.json`. Declining the prompt is valid, but hook-based
enforcement will be weaker.

## Repository Map

- `commands/` - Slash command specifications. Start here when changing user
  behavior. `commands/deep-work.md` is the orchestrator.
- `skills/` - Codex skill entrypoints and workflow wrappers.
- `agents/` - Worker prompt contracts for research and implementation. Codex
  does not enforce Claude-style per-agent tool frontmatter.
- `hooks/` - Runtime hook scripts and hook templates. These enforce phases,
  track files, update receipts, and trigger sensors.
- `sensors/` - Ecosystem detection and computational sensor execution.
- `health/` - Health baseline and project health-check logic.
- `templates/` - Topology and harness template helpers.
- `scripts/migrate-from-claude/` - One-time and regression-tested migration
  tooling from the Claude Code plugin source.
- `vendor/` - Source snapshot metadata for migration reference.
- `assumptions.json` - Explicit assumptions and advisory enforcement gaps.
- `docs/` - Local migration records and phase evidence. Do not treat docs as
  the runtime command source of truth.

## Workflow Surface

`/deep-work` drives the 6-phase development flow:

1. Brainstorm
2. Research
3. Plan
4. Implement
5. Test
6. Integrate

Supporting commands expose narrower operations such as `deep-research`,
`deep-plan`, `deep-implement`, `deep-test`, `deep-status`,
`deep-resume`, `deep-report`, `deep-receipt`, `deep-fork`, and
`deep-integrate`.

When changing behavior, update the command entrypoint first, then align skills,
hooks, README, and tests. Do not assume reference docs drive runtime behavior.

## Hook And State Model

- Runtime state is written under `.codex/`, not `.claude/`.
- Legacy `.claude/` state is read-only compatibility input. Helpers may import
  it once into `.codex/`, but Codex should not write new legacy state.
- State access should go through helper functions such as `read_state_file`,
  `write_state_file`, and `init_deep_work_state`.
- Hook stdin is the active contract. `parse_hook_stdin` reads the Codex JSON
  envelope and exports backward-compatible aliases for vendor-derived code.
- `file-tracker.sh` records `tools_used` and `model_used` into receipts for
  post-hoc validation.

## B-alpha Compatibility Notes

Codex currently lacks some Claude Code plugin semantics:

- Per-call worker model overrides are information-only. Spawned workers use the
  active Codex model unless Codex adds runtime model routing support.
- Per-agent tool allowlists are not runtime-enforced by Codex. This repo records
  tool usage in receipts and validates it later where possible.
- Structured `AskUserQuestion` options are represented as natural-language
  prompts.
- Team namespace APIs are not available. Parallel aggregation is preserved via
  multiple `spawn_agent` calls, but inter-agent messaging is not.

Treat these as documented semantic losses, not accidental TODOs.

## Migration Tooling

The scripts in `scripts/migrate-from-claude/` are used to reproduce and verify
the Claude-to-Codex migration. Their default paths are repo-relative, so they
continue to work after the repository is moved.

Common checks:

```bash
npm test
bash scripts/migrate-from-claude/verify-migration.sh
VERIFY_STRICT=1 bash scripts/migrate-from-claude/verify-migration.sh
```

Pass explicit vendor and target paths when testing a different source snapshot.

## Verification Checklist

Before finishing code changes:

- Run `npm test`.
- Run `git diff --check`.
- If migration scripts changed, run `node --check` on the edited `.mjs` files.
- If hook behavior changed, exercise the relevant hook script tests and inspect
  receipt/state side effects.
- If marketplace metadata changed, verify `codex-deep-suite` pins the intended
  Git SHA.

Current tracked test baseline:

- `tests/.baseline-count = 740`
- `tests/.expected-fail-count = 0`

## Maintenance Rules

- Keep command behavior and tests aligned. Passing prose-only review is not
  enough for hook or shell changes.
- Prefer repo-relative paths over user-local absolute paths.
- Keep `.codex/` as the write namespace and `.claude/` as legacy read-only
  input.
- Do not broaden Phase 5 or hook allowlists without an executable regression
  test.
- Keep public release metadata in `.codex-plugin/plugin.json`,
  `package.json`, README, and CHANGELOG consistent.
- The suite marketplace should pin released plugin SHAs with `source: "url"`
  and `sha`.
