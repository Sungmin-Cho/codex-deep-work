#!/usr/bin/env bash
# extract-hook-hardcodes.sh — Slice 0 deliverable.
# CC plugin 소스에서 Gemini 포팅 시 수정 대상 3축 하드코딩을 JSON으로 추출.
set -euo pipefail

SRC="${1:-}"
OUT="${2:-/dev/stdout}"

if [[ -z "$SRC" || ! -d "$SRC" ]]; then
  echo "Usage: $0 <source-dir> [output-file]" >&2
  exit 2
fi

ABS_SRC="$(cd "$SRC" && pwd)"

python3 - "$ABS_SRC" "$OUT" <<'PY'
import os, re, subprocess, json, sys, datetime

src = sys.argv[1]
out_path = sys.argv[2]

ENV_VARS = [
    "CLAUDE_TOOL_USE_TOOL_NAME",
    "CLAUDE_TOOL_NAME",
    "CLAUDE_TOOL_USE_INPUT",
    "CLAUDE_TOOL_INPUT",
    "CLAUDE_PLUGIN_ROOT",
    "CLAUDE_PROJECT_ROOT",
]
TOOL_LITERALS = ["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash", "Read", "Glob", "Grep"]
PATH_PATTERNS = ["claude-deep-suite", r"\.claude/plugins/cache", r"\.claude/deep-work"]
EXTS_PROD = (".sh", ".js", ".mjs", ".py")
SKIP_DIRS = {"node_modules", ".git", ".deep-work", ".deep-review", ".deep-docs", ".serena"}

def iter_files(root):
    for dp, dns, fns in os.walk(root):
        dns[:] = [d for d in dns if d not in SKIP_DIRS]
        for fn in fns:
            yield os.path.join(dp, fn)

def grep_file(path, pattern):
    """Python-only grep returning [(line_no, content)]."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            hits = []
            for i, line in enumerate(f, 1):
                if re.search(pattern, line):
                    hits.append((i, line.rstrip()[:200]))
            return hits
    except Exception:
        return []

result = {
    "source": src,
    "generated_at": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    "env_occurrences": {},
    "literal_tool_names": {},
    "absolute_paths": [],
    "state_file_paths": [],
    "fixture_env_count": {},
}

# Categorize files
prod_files = []
test_files = []
for f in iter_files(src):
    if not f.endswith(EXTS_PROD):
        continue
    if f.endswith(".test.js"):
        test_files.append(f)
    else:
        prod_files.append(f)

# 1. Env occurrences (prod)
for env in ENV_VARS:
    hits = []
    for f in prod_files:
        rel = os.path.relpath(f, src)
        for line_no, content in grep_file(f, re.escape(env)):
            hits.append({"file": rel, "line": line_no, "content": content})
    if hits:
        result["env_occurrences"][env] = hits

# 2. Fixture env count (test files)
for env in ENV_VARS:
    count = sum(1 for f in test_files if grep_file(f, re.escape(env)))
    if count:
        result["fixture_env_count"][env] = count

# 3. Literal tool names (prod, multiple match patterns)
for tool in TOOL_LITERALS:
    patterns = [
        rf'"{tool}"',
        rf"'{tool}'",
        rf'\|{tool}\|',
        rf'\|{tool}\)',
        rf"=== '{tool}'",
        rf'=== "{tool}"',
        rf'case "\$\w+" in .*{tool}',
    ]
    hits = []
    for f in prod_files:
        rel = os.path.relpath(f, src)
        for p in patterns:
            for line_no, content in grep_file(f, p):
                if (rel, line_no) not in {(h["file"], h["line"]) for h in hits}:
                    hits.append({"file": rel, "line": line_no, "content": content})
    if hits:
        result["literal_tool_names"][tool] = hits

# 4. Absolute path patterns (prod)
for pattern in PATH_PATTERNS:
    for f in prod_files:
        rel = os.path.relpath(f, src)
        for line_no, content in grep_file(f, pattern):
            result["absolute_paths"].append({
                "pattern": pattern, "file": rel, "line": line_no, "content": content
            })

# 5. State file path (.claude/deep-work references)
for f in prod_files:
    rel = os.path.relpath(f, src)
    for line_no, content in grep_file(f, r"\.claude/deep-work"):
        result["state_file_paths"].append({
            "file": rel, "line": line_no, "content": content
        })

# Write
if out_path == "/dev/stdout":
    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
else:
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        f.write("\n")

# Summary to stderr
env_total = sum(len(v) for v in result["env_occurrences"].values())
tool_total = sum(len(v) for v in result["literal_tool_names"].values())
print(f"[extract-hook-hardcodes] source={src}", file=sys.stderr)
print(f"  env_occurrences (prod): {env_total} total / {len(result['env_occurrences'])} env names", file=sys.stderr)
print(f"  literal_tool_names (prod): {tool_total} total / {len(result['literal_tool_names'])} tools", file=sys.stderr)
print(f"  absolute_paths: {len(result['absolute_paths'])}", file=sys.stderr)
print(f"  state_file_paths: {len(result['state_file_paths'])}", file=sys.stderr)
print(f"  fixture_env_count: {result['fixture_env_count']}", file=sys.stderr)
PY
