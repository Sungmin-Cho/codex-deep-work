#!/usr/bin/env node
// migrate-hooks.mjs — CC hooks → Gemini hooks automated transformation.
//
// Scope: copies hooks/scripts/* from CC source to Gemini extension + applies
// 3-axis transformations (env vars, tool name literals, abs paths, state paths).
// hooks.json is regenerated with Gemini event names + expanded matcher.
//
// Does NOT handle: exit code protocol refactor (CC exit 2 + stdout JSON →
// Gemini exit 0 + JSON preferred) — flagged in summary for manual review.
// Does NOT handle: phase-transition.sh merge into file-tracker.sh (β path)
// — writes both scripts transformed individually and notes β is a manual follow-up.
//
// Usage: node scripts/migrate-hooks.mjs <cc-source-dir> <output-dir>

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const [, , srcDir, outDir] = process.argv;
if (!srcDir || !outDir) {
  console.error("Usage: migrate-hooks.mjs <cc-source-dir> <output-dir>");
  process.exit(2);
}

const CC_HOOKS = path.join(srcDir, "hooks");
const OUT_HOOKS = path.join(outDir, "hooks");

fs.mkdirSync(path.join(OUT_HOOKS, "scripts"), { recursive: true });

// ── Transformation rules ─────────────────────────────────────────────

// Env var replacements: read value from stdin JSON instead of env
// After transform, scripts will assume TOOL_NAME/TOOL_INPUT vars are set by the
// script header (see TOOL_NAME_HELPER prepended to each sh script).
const ENV_RENAMES = {
  // CC env → Gemini equivalent comment (we leave env refs but the header
  // script parses stdin JSON into these same var names for drop-in compat)
  "${CLAUDE_TOOL_USE_TOOL_NAME:-${CLAUDE_TOOL_NAME:-}}": "${_HOOK_TOOL_NAME:-}",
  "${CLAUDE_TOOL_USE_TOOL_NAME:-${CLAUDE_TOOL_NAME:-}}" : "${_HOOK_TOOL_NAME:-}",
  "${CLAUDE_TOOL_USE_INPUT:-${CLAUDE_TOOL_INPUT:-}}": "${_HOOK_TOOL_INPUT:-}",
};

const TOOL_NAME_MAP = [
  // order matters: longer patterns first
  ["Write|Edit|MultiEdit|NotebookEdit", "write_file|replace"],
  ["Write\\|Edit\\|MultiEdit\\|NotebookEdit", "write_file|replace"],
  ["Write|Edit|MultiEdit", "write_file|replace"],
  ["Write\\|Edit\\|MultiEdit", "write_file|replace"],
  ["Write|Edit|Bash", "write_file|replace|run_shell_command"],
  ["Write\\|Edit\\|Bash", "write_file|replace|run_shell_command"],
  // Individual literal replacements in shell case patterns
];

const TOOL_NAME_REPLACEMENTS = [
  { cc: '"Write"', gem: '"write_file"' },
  { cc: "'Write'", gem: "'write_file'" },
  { cc: '"Edit"', gem: '"replace"' },
  { cc: "'Edit'", gem: "'replace'" },
  { cc: '"MultiEdit"', gem: '"replace"', note: "MultiEdit merged into replace — transactional via skill-level pre-validation" },
  { cc: "'MultiEdit'", gem: "'replace'" },
  { cc: '"NotebookEdit"', gem: '"write_file"', note: "NotebookEdit not supported in Gemini; fallback to write_file" },
  { cc: "'NotebookEdit'", gem: "'write_file'" },
  { cc: '"Bash"', gem: '"run_shell_command"' },
  { cc: "'Bash'", gem: "'run_shell_command'" },
  { cc: "=== 'Write'", gem: "=== 'write_file'" },
  { cc: "=== 'Edit'", gem: "=== 'replace'" },
  { cc: "=== 'Bash'", gem: "=== 'run_shell_command'" },
  { cc: "=== 'MultiEdit'", gem: "=== 'replace'" },
  { cc: '=== "Write"', gem: '=== "write_file"' },
  { cc: '=== "Edit"', gem: '=== "replace"' },
  { cc: '=== "Bash"', gem: '=== "run_shell_command"' },
];

// Case pattern in shell: Write|Edit|MultiEdit|NotebookEdit)
// Match the whole case branch pattern
const CASE_PATTERNS = [
  { cc: /Write\|Edit\|MultiEdit\|NotebookEdit\)/g, gem: "write_file|replace)" },
  { cc: /Write\|Edit\|MultiEdit\)/g, gem: "write_file|replace)" },
  { cc: /Write\|Edit\)/g, gem: "write_file|replace)" },
];

// Path and state transformations
const PATH_REPLACEMENTS = [
  { cc: /\$\{CLAUDE_PLUGIN_ROOT\}/g, gem: "${extensionPath}" },
  { cc: /\bclaude-deep-suite\/deep-work\/[^/]+\/skills\/deep-integrate/g, gem: "${extensionPath}/skills/deep-integrate" },
  { cc: /\bclaude-deep-suite\/deep-work\/[^/]+\/skills/g, gem: "${extensionPath}/skills" },
  { cc: /\bclaude-deep-suite\b/g, gem: "gemini-deep-suite" },
  { cc: /\.claude\/deep-work/g, gem: ".gemini/deep-work" },
  { cc: /\.claude\/\.hook-tool-input/g, gem: ".gemini/deep-work/.hook-tool-input" },
  { cc: /\$HOME\/\.claude\/plugins\/cache/g, gem: "$HOME/.gemini/extensions" },
];

// Shell helper header that parses stdin JSON into _HOOK_TOOL_NAME / _HOOK_TOOL_INPUT
// Prepended to hook shell scripts that need stdin parsing.
const STDIN_PARSE_HEADER = `
# ── Gemini stdin JSON parsing (replaces CC env vars) ───────────────────
# Called once at script start. Reads stdin JSON (Gemini envelope) and sets
# _HOOK_TOOL_NAME / _HOOK_TOOL_INPUT / _HOOK_EVENT_NAME — BUT only if the
# stdin actually contains those fields. Pre-set env vars (e.g. from test
# fixtures or legacy CC compatibility) are preserved when stdin is silent.
_hook_parse_stdin() {
  if [[ ! -t 0 ]]; then
    _HOOK_STDIN="$(cat)"
  else
    _HOOK_STDIN=""
  fi
  if [[ -n "$_HOOK_STDIN" ]]; then
    _stdin_tn="$(printf '%s' "$_HOOK_STDIN" | python3 -c 'import json,sys
try:
  d=json.loads(sys.stdin.read())
  v=d.get("tool_name","")
  print(v if isinstance(v,str) else "")
except Exception:
  pass' 2>/dev/null || echo "")"
    [[ -n "$_stdin_tn" ]] && _HOOK_TOOL_NAME="$_stdin_tn"
    _stdin_ti="$(printf '%s' "$_HOOK_STDIN" | python3 -c 'import json,sys
raw=sys.stdin.read()
try:
  d=json.loads(raw)
  if isinstance(d,dict) and "tool_name" in d and "tool_input" in d:
    ti=d["tool_input"]
    if isinstance(ti,(dict,list)):
      print(json.dumps(ti,separators=(",",":")))
    else:
      print(str(ti))
  elif isinstance(d,dict) and "tool_name" not in d:
    print(raw,end="")
except Exception:
  pass' 2>/dev/null || echo "")"
    [[ -n "$_stdin_ti" ]] && _HOOK_TOOL_INPUT="$_stdin_ti"
    _stdin_en="$(printf '%s' "$_HOOK_STDIN" | python3 -c 'import json,sys
try:
  d=json.loads(sys.stdin.read())
  print(d.get("hook_event_name",""))
except Exception:
  pass' 2>/dev/null || echo "")"
    [[ -n "$_stdin_en" ]] && _HOOK_EVENT_NAME="$_stdin_en"
  fi
  export _HOOK_STDIN _HOOK_TOOL_NAME _HOOK_TOOL_INPUT _HOOK_EVENT_NAME
}
_hook_parse_stdin
`;

function transformFile(content, ext) {
  let c = content;
  // 1. Env var renames (order-sensitive: multi-level fallbacks first)
  for (const [cc, gem] of Object.entries(ENV_RENAMES)) {
    c = c.split(cc).join(gem);
  }
  // Simple env fallbacks
  c = c.replace(/\$\{CLAUDE_TOOL_USE_TOOL_NAME:-([^}]*)\}/g, '${_HOOK_TOOL_NAME:-$1}');
  c = c.replace(/\$\{CLAUDE_TOOL_USE_TOOL_NAME:-\}/g, '${_HOOK_TOOL_NAME:-}');
  c = c.replace(/\$\{CLAUDE_TOOL_NAME:-([^}]*)\}/g, '${_HOOK_TOOL_NAME:-$1}');
  c = c.replace(/\bCLAUDE_TOOL_USE_TOOL_NAME\b/g, "_HOOK_TOOL_NAME");
  c = c.replace(/\bCLAUDE_TOOL_NAME\b/g, "_HOOK_TOOL_NAME");
  c = c.replace(/\bCLAUDE_TOOL_USE_INPUT\b/g, "_HOOK_TOOL_INPUT");
  c = c.replace(/\bCLAUDE_TOOL_INPUT\b/g, "_HOOK_TOOL_INPUT");

  // 2. Shell case patterns (Write|Edit|MultiEdit...)
  for (const p of CASE_PATTERNS) c = c.replace(p.cc, p.gem);

  // 3. Individual tool name string literals (within quotes)
  for (const r of TOOL_NAME_REPLACEMENTS) {
    c = c.split(r.cc).join(r.gem);
  }

  // 4. Path + state transforms
  for (const r of PATH_REPLACEMENTS) c = c.replace(r.cc, r.gem);

  return c;
}

// ── Main ─────────────────────────────────────────────────────────────

const scriptsSrc = path.join(CC_HOOKS, "scripts");
if (!fs.existsSync(scriptsSrc)) {
  console.error(`[migrate-hooks] source hooks/scripts not found: ${scriptsSrc}`);
  process.exit(1);
}

const files = fs.readdirSync(scriptsSrc);
const summary = { transformed: 0, sh: 0, js: 0, tests: 0, warnings: [] };

for (const f of files) {
  const srcP = path.join(scriptsSrc, f);
  const dstP = path.join(OUT_HOOKS, "scripts", f);
  if (fs.statSync(srcP).isDirectory()) continue;

  let content = fs.readFileSync(srcP, "utf8");
  const original = content;
  content = transformFile(content, path.extname(f));

  // For .sh files that reference _HOOK_TOOL_NAME/_HOOK_TOOL_INPUT, inject stdin parser header
  if (f.endsWith(".sh") && (content.includes("_HOOK_TOOL_NAME") || content.includes("_HOOK_TOOL_INPUT"))) {
    // Inject after shebang and initial comment block, before first real code
    const lines = content.split("\n");
    let injectIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("#!")) { injectIdx = i + 1; continue; }
      if (lines[i].trim() === "" || lines[i].trim().startsWith("#")) continue;
      injectIdx = i;
      break;
    }
    lines.splice(injectIdx, 0, STDIN_PARSE_HEADER);
    content = lines.join("\n");
  }

  fs.writeFileSync(dstP, content);
  // Preserve exec bit
  try {
    const st = fs.statSync(srcP);
    fs.chmodSync(dstP, st.mode);
  } catch {}

  if (content !== original) summary.transformed++;
  if (f.endsWith(".sh")) summary.sh++;
  else if (f.endsWith(".test.js")) summary.tests++;
  else if (f.endsWith(".js")) summary.js++;
}

// ── Generate Gemini hooks.json ──────────────────────────────────────────

const geminiHooksJson = {
  description: "Phase enforcement, file tracking, update check, and session lifecycle hooks (Gemini port v0.1.0)",
  hooks: {
    SessionStart: [
      {
        matcher: "startup|resume|clear|compact",
        hooks: [
          {
            type: "command",
            command: "bash ${extensionPath}/hooks/scripts/update-check.sh",
            timeout: 8000
          },
          {
            type: "command",
            command: "node ${extensionPath}/sensors/detect.js",
            timeout: 8000
          }
        ]
      }
    ],
    BeforeTool: [
      {
        // Expanded matcher (Adv-H3): all mutating tools
        matcher: "write_file|replace|run_shell_command|write_todos|save_memory|tracker_create_task|tracker_update_task|tracker_add_dependency",
        hooks: [
          {
            type: "command",
            command: "bash ${extensionPath}/hooks/scripts/phase-guard.sh",
            timeout: 5000
          }
        ]
      }
    ],
    AfterTool: [
      {
        matcher: "write_file|replace|run_shell_command",
        hooks: [
          {
            type: "command",
            // file-tracker.sh includes merged phase-transition logic (β path)
            command: "bash ${extensionPath}/hooks/scripts/file-tracker.sh",
            timeout: 3000
          },
          {
            type: "command",
            command: "node ${extensionPath}/hooks/scripts/sensor-trigger.js",
            timeout: 3000
          }
        ]
      }
    ],
    SessionEnd: [
      {
        matcher: "",
        hooks: [
          {
            type: "command",
            command: "bash ${extensionPath}/hooks/scripts/session-end.sh",
            timeout: 5000
          }
        ]
      }
    ]
  }
};

fs.writeFileSync(
  path.join(OUT_HOOKS, "hooks.json"),
  JSON.stringify(geminiHooksJson, null, 2) + "\n"
);

// Warnings
summary.warnings.push("exit 2 + stdout JSON patterns NOT refactored — Gemini ignores stdout JSON on exit 2. Manual pass required in phase-guard.sh block decisions.");
summary.warnings.push("phase-transition.sh logic NOT merged into file-tracker.sh (β path). Manual follow-up required — see Slice 0 OQ-15 findings.");
summary.warnings.push("MultiEdit transactional pre-validation NOT added. Skill body (deep-implement) should instruct LLM to pre-validate all replace pairs.");

console.log(`[migrate-hooks] Processed ${files.length} files`);
console.log(`  - sh scripts: ${summary.sh}`);
console.log(`  - js scripts (prod): ${summary.js}`);
console.log(`  - test files: ${summary.tests}`);
console.log(`  - transformed (content changed): ${summary.transformed}`);
console.log(`  - hooks.json regenerated`);
console.log(`\n[migrate-hooks] ⚠️  Manual follow-ups required:`);
for (const w of summary.warnings) console.log(`   - ${w}`);
