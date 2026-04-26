'use strict';
const fs = require('node:fs');

const FIELDS_TO_MIGRATE = ['research', 'implement', 'test'];

/**
 * Atomically migrate `model_routing.{research,implement,test}: "main"`
 * to "sonnet" in a deep-work state file YAML frontmatter.
 *
 * `plan` is intentionally excluded because "main" remains valid there.
 */
function migrateStateFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { replaced: [], warnings: [] };
  }

  const src = fs.readFileSync(filePath, 'utf8');
  const replaced = [];
  const warnings = [];
  const lines = src.split('\n');
  const modelRoutingIdx = lines.findIndex((l) => /^model_routing:\s*(#.*)?$/.test(l));

  if (modelRoutingIdx < 0) {
    return { replaced, warnings };
  }

  let blockEnd = lines.length;
  for (let i = modelRoutingIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    if (!/^\s/.test(line)) {
      blockEnd = i;
      break;
    }
  }

  let modified = false;

  for (let i = modelRoutingIdx + 1; i < blockEnd; i++) {
    const line = lines[i];
    const fieldRe = /^(\s+)(\w+):\s*(["']?)([^"'\s#]+)\3(\s*(?:#.*)?)$/;
    const m = line.match(fieldRe);
    if (!m) continue;
    const [, indent, field, , value, suffix] = m;

    if (!FIELDS_TO_MIGRATE.includes(field)) continue;

    if (value === 'main') {
      lines[i] = `${indent}${field}: "sonnet"${suffix}`;
      replaced.push(field);
      modified = true;
    } else if (/^main-/.test(value)) {
      warnings.push(`unknown model_routing.${field} value "${value}" — preserved as-is`);
    }
  }

  if (modified) {
    const tmp = filePath + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, lines.join('\n'), { mode: 0o644 });
    fs.renameSync(tmp, filePath);
  }

  return { replaced, warnings };
}

module.exports = { migrateStateFile, FIELDS_TO_MIGRATE };

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: migrate-model-routing.js <state-file>');
    process.exit(2);
  }

  const { replaced, warnings } = migrateStateFile(target);
  for (const w of warnings) console.error(`[migration v6.4.0] ${w}`);
  for (const field of replaced) {
    console.log(`[migration v6.4.0] model_routing.${field}='main' deprecated → 'sonnet' 적용`);
  }
  if (replaced.length > 0) {
    console.log('[migration v6.4.0] ⚠ Behavior change notice: "main" previously meant');
    console.log('  "inline execution in current session" (hook-protected). It has been');
    console.log('  migrated to "sonnet" which means "delegate to subagent" (hook not applied,');
    console.log('  relies on Receipt + verify-receipt). If you specifically needed inline');
    console.log('  execution, re-run with `--exec=inline` or set `tdd_mode: spike` for');
    console.log('  spike-mode auto-inline. See spec §5.5a / migration guide docs/migrations/v6.4.0.md.');
  }
  process.exit(0);
}
