#!/usr/bin/env node
// migrate-skills.mjs — CC commands + CC skills → Gemini skills
//
// Usage: node scripts/migrate-skills.mjs <cc-source-dir> <output-dir>
// Example: node scripts/migrate-skills.mjs ~/Dev/deep-work packages/deep-work

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const [, , srcDir, outDir] = process.argv;
if (!srcDir || !outDir) {
  console.error("Usage: migrate-skills.mjs <cc-source-dir> <output-dir>");
  process.exit(2);
}

const CC_CMD_DIR = path.join(srcDir, "commands");
const CC_SKILL_DIR = path.join(srcDir, "skills");
const OUT_SKILL_DIR = path.join(outDir, "skills");

// Mapping: CC Skill() targets → Gemini skill name (when command calls a different-named skill)
const SKILL_RENAMES = {
  "deep-work-orchestrator": "deep-work", // /deep-work command → orchestrator skill → renamed to match
};

// Transformation rules applied to body text
function transformBody(text, targetName) {
  let body = text;

  // 1. Remove CC frontmatter (--- ... ---)
  body = body.replace(/^---\n[\s\S]*?\n---\n/, "");

  // 2. Skill("x", args="$ARGUMENTS") → natural language instruction
  body = body.replace(
    /Skill\(\s*"([^"]+)"\s*,?\s*args\s*=\s*"?\$ARGUMENTS"?\s*\)/g,
    (_m, target) => {
      const renamed = SKILL_RENAMES[target] || target;
      return `Next, activate the \`/${renamed}\` skill. The user's task input will be passed automatically via postSubmitPrompt.`;
    }
  );
  body = body.replace(
    /Skill\(\s*"([^"]+)"\s*,?\s*args\s*=\s*"([^"]*)"\s*\)/g,
    (_m, target, args) => {
      const renamed = SKILL_RENAMES[target] || target;
      return `Activate \`/${renamed}\` with args: "${args}".`;
    }
  );
  // Skill("x", args=ARGS) or args=ARGS + "..." — variable-reference form
  body = body.replace(
    /Skill\(\s*"([^"]+)"\s*,\s*args\s*=\s*ARGS(?:\s*\+\s*"[^"]*")?\s*\)/g,
    (_m, target) => {
      const renamed = SKILL_RENAMES[target] || target;
      return `Activate \`/${renamed}\` skill (pass the orchestrator's ARGS through).`;
    }
  );
  body = body.replace(/Skill\(\s*"([^"]+)"\s*\)/g, (_m, target) => {
    const renamed = SKILL_RENAMES[target] || target;
    return `Activate \`/${renamed}\` skill.`;
  });

  // 3. Agent(subagent_type="x", ...) → natural language
  body = body.replace(
    /Agent\(\s*subagent_type\s*=\s*"([^"]+)"[^)]*\)/g,
    (_m, target) => `Activate the \`${target}\` skill if installed (falls back to noop if unavailable).`
  );

  // 4. AskUserQuestion([...]) → ask_user tool instruction
  body = body.replace(
    /AskUserQuestion\(\s*\[[\s\S]*?\]\s*\)/g,
    "Use the `ask_user` tool with the appropriate questions spec (see skill body for question details)."
  );
  body = body.replace(/AskUserQuestion\b/g, "`ask_user` tool");

  // 5. TaskCreate/Update/List/Get → tracker_*
  body = body.replace(/TaskCreate\s*\(/g, "`tracker_create_task` tool (");
  body = body.replace(/TaskUpdate\s*\(/g, "`tracker_update_task` tool (");
  body = body.replace(/TaskList\s*\(?/g, "`tracker_list_tasks` tool");
  body = body.replace(/TaskGet\s*\(/g, "`tracker_get_task` tool (");

  // 6. TeamCreate / SendMessage → solo-mode noop
  body = body.replace(
    /TeamCreate\([^)]*\)/g,
    "(Team mode — v0.1.0 solo, execute sequentially)"
  );
  body = body.replace(/SendMessage\([^)]*\)/g, "(SendMessage — not applicable in solo mode)");

  // 7. $ARGUMENTS in skill body → natural reference
  // IMPORTANT: skill bodies use postSubmitPrompt, not template placeholders
  body = body.replace(
    /\$ARGUMENTS/g,
    "[the user's task input provided via postSubmitPrompt after this skill body]"
  );

  // 8. ${CLAUDE_PLUGIN_ROOT} → ${extensionPath}
  body = body.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, "${extensionPath}");

  // 9. Tool names (CC → Gemini)
  const toolMap = {
    Write: "write_file",
    Edit: "replace",
    MultiEdit: "replace (with transactional pre-validation — see E2 in Plan)",
    NotebookEdit: "(not supported in Gemini — use write_file for notebook JSON)",
    Bash: "run_shell_command",
    Read: "read_file",
    Glob: "glob",
    Grep: "grep_search",
    TaskCreate: "tracker_create_task",
    TaskUpdate: "tracker_update_task",
    TaskList: "tracker_list_tasks",
    TaskGet: "tracker_get_task",
    AskUserQuestion: "ask_user",
  };
  // Apply tool renames in backticks to preserve text flow
  for (const [cc, gem] of Object.entries(toolMap)) {
    body = body.replace(new RegExp(`\\\`${cc}\\\``, "g"), `\`${gem}\``);
  }
  // Also in bullet/list contexts (not perfect, but covers most cases)
  body = body.replace(/\b(use |using |via |call |invoking |invoke )(Write|Edit|MultiEdit|Bash|Read|Glob|Grep)\b/gi, (m, verb, tool) => {
    const gem = toolMap[tool] || tool;
    return `${verb}\`${gem}\``;
  });

  // 10. State file paths
  body = body.replace(/\.claude\/deep-work/g, ".gemini/deep-work");

  // 11. Plugin path references
  body = body.replace(/claude-deep-suite/g, "gemini-deep-suite");
  body = body.replace(/\$\{HOME\}\/\.claude\/plugins\/cache/g, "${HOME}/.gemini/extensions");

  return body;
}

// Extract description from CC command body (first # heading + next paragraph)
function extractDescription(cmdBody) {
  // Remove frontmatter
  const body = cmdBody.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
  // Try first paragraph after heading
  const match = body.match(/^#\s+[^\n]+\n\n([^\n]+)/);
  if (match) return match[1].trim().replace(/["`]/g, "");
  // Fallback: first non-heading line
  const lines = body.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  return (lines[0] || "CC-sourced skill").replace(/["`]/g, "").slice(0, 200);
}

// Sanitize YAML description value (avoid folded-block > or pipe | ambiguity, escape quotes)
function sanitizeDescription(raw) {
  if (!raw) return "CC-sourced skill";
  // Strip leading folded-block/pipe indicators ("> " or "| ")
  let d = raw.replace(/^\s*[>|]\s*/, "");
  // Collapse newlines to spaces
  d = d.replace(/\s*\n\s*/g, " ").trim();
  // Escape double quotes
  d = d.replace(/"/g, '\\"');
  // Limit length (Gemini UI truncates long descriptions)
  if (d.length > 280) d = d.slice(0, 277) + "...";
  return `"${d}"`;
}

// Generate Gemini SKILL.md
function buildSkillMd(name, description, body) {
  const desc = sanitizeDescription(description);
  const fm = `---\nname: ${name}\ndescription: ${desc}\n---\n\n`;
  return fm + body.trimStart();
}

// Main
const ccCommands = fs.readdirSync(CC_CMD_DIR).filter((f) => f.endsWith(".md"));
const ccSkills = fs.readdirSync(CC_SKILL_DIR).filter((f) =>
  fs.statSync(path.join(CC_SKILL_DIR, f)).isDirectory() && f !== "shared"
);

console.log(`[migrate-skills] Found ${ccCommands.length} CC commands, ${ccSkills.length} CC skill dirs`);

let skillsWritten = 0;
const conflicts = [];

// Strategy: For each CC command, decide:
// - If it's a thin wrapper (calls Skill(X)): create Gemini skill from CC skill X body
// - If inline: convert CC command body into Gemini skill
for (const cmdFile of ccCommands) {
  const cmdName = path.basename(cmdFile, ".md");
  const cmdPath = path.join(CC_CMD_DIR, cmdFile);
  const cmdBody = fs.readFileSync(cmdPath, "utf8");

  // Detect Skill() call
  const skillCallMatch = cmdBody.match(/Skill\(\s*"([^"]+)"/);
  let sourceBody;
  let description = extractDescription(cmdBody);

  if (skillCallMatch) {
    const skillTarget = skillCallMatch[1];
    const skillSrcDir = path.join(CC_SKILL_DIR, skillTarget);
    if (fs.existsSync(path.join(skillSrcDir, "SKILL.md"))) {
      sourceBody = fs.readFileSync(path.join(skillSrcDir, "SKILL.md"), "utf8");
      // Replace description from skill frontmatter if available
      const skillFmMatch = sourceBody.match(/^---\n([\s\S]*?)\n---/);
      if (skillFmMatch) {
        const descMatch = skillFmMatch[1].match(/description\s*:\s*"?([^"\n]+)"?/);
        if (descMatch) description = descMatch[1].trim();
      }
    } else {
      console.warn(`  ⚠️  ${cmdName}: Skill() target '${skillTarget}' not found, using command body`);
      sourceBody = cmdBody;
    }
  } else {
    // Inline logic — use command body directly
    sourceBody = cmdBody;
  }

  const transformedBody = transformBody(sourceBody, cmdName);
  const skillMd = buildSkillMd(cmdName, description, transformedBody);

  const outSkillDir = path.join(OUT_SKILL_DIR, cmdName);
  fs.mkdirSync(outSkillDir, { recursive: true });
  const outSkillFile = path.join(outSkillDir, "SKILL.md");
  fs.writeFileSync(outSkillFile, skillMd);
  skillsWritten++;

  // Detect potential post-transform issues
  if (transformedBody.includes("$ARGUMENTS") || transformedBody.includes("${CLAUDE_PLUGIN_ROOT}") ||
      transformedBody.includes(".claude/deep-work") || transformedBody.match(/^Skill\(/m)) {
    conflicts.push({ skill: cmdName, file: outSkillFile });
  }
}

// Copy shared/references/*.md (14) as-is (no transformation — they're reference docs)
const sharedSrc = path.join(CC_SKILL_DIR, "shared");
if (fs.existsSync(sharedSrc)) {
  const sharedDst = path.join(OUT_SKILL_DIR, "shared");
  fs.mkdirSync(sharedDst, { recursive: true });
  fs.cpSync(sharedSrc, sharedDst, { recursive: true });
  const refCount = fs.readdirSync(path.join(sharedDst, "references")).filter((f) => f.endsWith(".md")).length;
  console.log(`[migrate-skills] Copied ${refCount} shared references → ${sharedDst}/references/`);
  // Apply transformations to shared references too (they may reference CC primitives)
  const refsDir = path.join(sharedDst, "references");
  for (const refFile of fs.readdirSync(refsDir).filter((f) => f.endsWith(".md"))) {
    const refPath = path.join(refsDir, refFile);
    const original = fs.readFileSync(refPath, "utf8");
    const transformed = transformBody(original, path.basename(refFile, ".md"));
    // Preserve the .md body; transformBody strips frontmatter so merge
    // Most reference files have no frontmatter, so we just write transformed
    if (original.startsWith("---\n")) {
      const fmEnd = original.indexOf("\n---\n", 4) + 5;
      const fm = original.slice(0, fmEnd);
      fs.writeFileSync(refPath, fm + transformed.trimStart());
    } else {
      fs.writeFileSync(refPath, transformed.trimStart());
    }
  }
}

// Copy deep-integrate subdirectories (schema/, fixtures/, *.sh, *.test.js) as-is
// BUT also write the deep-integrate SKILL.md via normal flow (done above if cmd exists)
const integrateSrc = path.join(CC_SKILL_DIR, "deep-integrate");
const integrateDst = path.join(OUT_SKILL_DIR, "deep-integrate");
if (fs.existsSync(integrateSrc)) {
  // Skip SKILL.md (already written via command flow) and CC frontmatter stuff
  for (const entry of fs.readdirSync(integrateSrc)) {
    if (entry === "SKILL.md") continue; // already handled
    const src = path.join(integrateSrc, entry);
    const dst = path.join(integrateDst, entry);
    if (fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dst, { recursive: true });
    } else {
      fs.copyFileSync(src, dst);
    }
  }
  console.log(`[migrate-skills] Copied deep-integrate assets (schema/fixtures/sh)`);

  // Apply path/env transformations to shell scripts
  const shScripts = fs.readdirSync(integrateDst, { recursive: true })
    .filter((f) => typeof f === "string" && (f.endsWith(".sh") || f.endsWith(".test.js")));
  for (const f of shScripts) {
    const p = path.join(integrateDst, f);
    if (!fs.statSync(p).isFile()) continue;
    let content = fs.readFileSync(p, "utf8");
    content = content.replace(/\.claude\/deep-work/g, ".gemini/deep-work");
    content = content.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, "${extensionPath}");
    content = content.replace(/\bCLAUDE_TOOL_USE_TOOL_NAME\b/g, "TOOL_NAME_FROM_STDIN_JSON");
    content = content.replace(/\bCLAUDE_TOOL_NAME\b/g, "TOOL_NAME_FROM_STDIN_JSON");
    content = content.replace(/\bclaude-deep-suite\b/g, "gemini-deep-suite");
    fs.writeFileSync(p, content);
  }
}

// Add deep-work-workflow as a skill (not auto-registered via command but useful for /deep-work-workflow)
const workflowSrc = path.join(CC_SKILL_DIR, "deep-work-workflow", "SKILL.md");
if (fs.existsSync(workflowSrc)) {
  const workflowBody = fs.readFileSync(workflowSrc, "utf8");
  const transformed = transformBody(workflowBody, "deep-work-workflow");
  const fmMatch = workflowBody.match(/description\s*:\s*"?([^"\n]+)"?/);
  const desc = fmMatch ? fmMatch[1].trim() : "Deep-work workflow overview and references";
  const skillMd = buildSkillMd("deep-work-workflow", desc, transformed);
  const dir = path.join(OUT_SKILL_DIR, "deep-work-workflow");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), skillMd);
  skillsWritten++;
}

console.log(`\n[migrate-skills] ✅ Wrote ${skillsWritten} skills to ${OUT_SKILL_DIR}/`);

if (conflicts.length) {
  console.warn(`\n[migrate-skills] ⚠️  ${conflicts.length} skill(s) still contain CC-specific strings:`);
  for (const c of conflicts) {
    console.warn(`   - ${c.skill}: ${c.file}`);
  }
  console.warn("   Review and refine transformation rules.");
}
