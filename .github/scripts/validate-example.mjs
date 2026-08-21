#!/usr/bin/env bun
// Validator for newly added examples.
//
// It enforces the contribution rules for an example directory:
//   - package.json (if present) must NOT have a `version` field
//   - package.json (if present) must have `private: true`
//   - package.json (if present) must have no empty fields ("", [], {}, null)
//   - package.json (if present) must have a meaningful, single-line `description`
//   - README.md must be present at the example root
//   - .env.example must be present at the example root
//
// Scope: by design this only checks examples that are ADDED in a pull request,
// keyed off a newly added package.json. Edits to existing examples are left
// alone (many predate these rules), and nested sub-packages such as `web/`
// are validated for the package.json field rules but are not required to carry
// their own README.md / .env.example.
//
// Runtime: Bun. The script relies only on `node:` built-ins, which Bun
// implements, so it runs the same under `bun` or `node`.
//
// Usage:
//   bun .github/scripts/validate-example.mjs                # diff mode (CI): validate examples added vs. the base ref
//   bun .github/scripts/validate-example.mjs with-foo bots/bar   # validate the given example roots directly
//
// Environment (diff mode):
//   GITHUB_BASE_REF   base branch of the PR (e.g. "main"); falls back to "main"

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();

const isCI = Boolean(process.env.GITHUB_ACTIONS);

/** Emit a GitHub Actions error annotation (falls back to plain text locally). */
function annotate(file, message) {
  if (isCI) {
    const clean = message.replace(/\n/g, '%0A');
    console.log(`::error file=${file}::${clean}`);
  }
}

const problems = [];
function fail(dir, file, message) {
  problems.push({ dir, file, message });
  annotate(file, message);
}

/** True if any ancestor directory of `dir` (up to repo root) holds a package.json. */
function hasAncestorPackageJson(dir) {
  let cur = path.dirname(dir);
  while (cur.startsWith(repoRoot) && cur !== repoRoot) {
    if (fs.existsSync(path.join(cur, 'package.json'))) return true;
    cur = path.dirname(cur);
  }
  return false;
}

/** Recursively find keys whose value is empty ("", [], {}, or null). */
function findEmptyFields(value, prefix = '') {
  const empties = [];
  if (value === null) {
    empties.push(prefix || '(root)');
    return empties;
  }
  if (typeof value === 'string' && value.trim() === '') {
    empties.push(prefix);
  } else if (Array.isArray(value)) {
    if (value.length === 0) empties.push(prefix);
  } else if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      empties.push(prefix || '(root)');
    } else {
      for (const key of keys) {
        const next = prefix ? `${prefix}.${key}` : key;
        empties.push(...findEmptyFields(value[key], next));
      }
    }
  }
  return empties;
}

/**
 * Validate a single package.json.
 * @param {boolean} isRoot whether this is the example root (extra rules apply)
 */
function validatePackageJson(pkgPath, isRoot) {
  const rel = path.relative(repoRoot, pkgPath);
  let raw;
  try {
    raw = fs.readFileSync(pkgPath, 'utf8');
  } catch (err) {
    fail(path.dirname(pkgPath), rel, `Unable to read this file: ${err.message}`);
    return;
  }

  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch (err) {
    fail(path.dirname(pkgPath), rel, `Not valid JSON: ${err.message}`);
    return;
  }

  const dir = path.dirname(pkgPath);

  // No version field.
  if ('version' in pkg) {
    fail(dir, rel, `Remove the \`version\` field (found \`${pkg.version}\`).`);
  }

  // private: true must be present.
  if (pkg.private !== true) {
    fail(dir, rel, 'Set `"private": true`.');
  }

  // No empty fields anywhere in the object.
  const empties = findEmptyFields(pkg);
  if (empties.length > 0) {
    const list = empties.map((e) => `\`${e}\``).join(', ');
    fail(dir, rel, `Remove or fill empty field(s): ${list}.`);
  }

  // Meaningful, single-line description — required at the example root.
  if (isRoot) {
    const desc = pkg.description;
    if (typeof desc !== 'string' || desc.trim() === '') {
      fail(dir, rel, 'Add a non-empty `description`.');
    } else {
      const trimmed = desc.trim();
      if (/[\r\n]/.test(desc)) {
        fail(dir, rel, 'Make `description` a single line (no line breaks).');
      }
      if (trimmed.length < 15) {
        fail(dir, rel, '`description` is too short to be meaningful (min 15 chars).');
      }
      if (trimmed.split(/\s+/).length < 3) {
        fail(dir, rel, '`description` should be a meaningful phrase of at least 3 words.');
      }
      if (pkg.name && trimmed.toLowerCase() === String(pkg.name).toLowerCase()) {
        fail(dir, rel, '`description` must not simply repeat the package name.');
      }
    }
  }
}

/** Full validation of an example root directory. */
function validateExampleRoot(dir) {
  const pkgPath = path.join(dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    validatePackageJson(pkgPath, true);
  }

  if (!fs.existsSync(path.join(dir, 'README.md'))) {
    fail(dir, path.join(path.relative(repoRoot, dir), 'README.md'), 'Add a `README.md`.');
  }

  if (!fs.existsSync(path.join(dir, '.env.example'))) {
    fail(dir, path.join(path.relative(repoRoot, dir), '.env.example'), 'Add an `.env.example`.');
  }
}

/** Diff mode: figure out which examples were added in this PR. */
function collectAddedExampleRoots() {
  const baseRef = process.env.GITHUB_BASE_REF || 'main';
  let diffBase = baseRef;
  // Prefer the remote-tracking ref when it exists (CI checks out a detached HEAD).
  try {
    execFileSync('git', ['rev-parse', '--verify', `origin/${baseRef}`], {
      stdio: 'ignore',
    });
    diffBase = `origin/${baseRef}`;
  } catch {
    // fall back to the bare ref
  }

  let out;
  try {
    out = execFileSync(
      'git',
      ['diff', '--name-only', '--diff-filter=A', `${diffBase}...HEAD`],
      { encoding: 'utf8' },
    );
  } catch (err) {
    console.error(`Could not diff against ${diffBase}: ${err.message}`);
    process.exit(1);
  }

  const addedFiles = out.split('\n').map((l) => l.trim()).filter(Boolean);

  const roots = new Set();
  const subPackages = new Set();

  for (const file of addedFiles) {
    if (path.basename(file) !== 'package.json') continue;
    const absDir = path.join(repoRoot, path.dirname(file));
    if (hasAncestorPackageJson(absDir)) {
      subPackages.add(absDir); // nested sub-package (e.g. web/)
    } else {
      roots.add(absDir); // example root
    }
  }

  return { roots: [...roots], subPackages: [...subPackages], addedFiles };
}

/** Marker so the workflow can find and update its own sticky comment. */
const COMMENT_MARKER = '<!-- validate-example-bot -->';

/**
 * Render a repo-relative path as a markdown link to that path in the PR head,
 * when REPO_URL + HEAD_SHA are provided (CI). Existing files link to the blob;
 * paths that don't exist yet (e.g. a missing README.md) link to the directory
 * listing so the reader lands somewhere real. Falls back to inline code.
 */
function pathLink(rel) {
  const label = `\`${rel}\``;
  const repoUrl = process.env.REPO_URL;
  const sha = process.env.HEAD_SHA;
  if (!repoUrl || !sha) return label;
  const abs = path.join(repoRoot, rel);
  if (fs.existsSync(abs)) {
    return `[${label}](${repoUrl}/blob/${sha}/${rel})`;
  }
  const dir = path.dirname(rel);
  return `[${label}](${repoUrl}/tree/${sha}/${dir})`;
}

/** Build the markdown body posted as a PR comment. */
function buildReport(validated, ok) {
  const lines = [COMMENT_MARKER, '## Pre-review requirements'];
  if (ok) {
    lines.push('', '✅ All checks passed for the example(s) added in this PR:', '');
    for (const name of validated) lines.push(`- ${pathLink(name)}`);
  } else {
    lines.push('', `❌ Found ${problems.length} problem(s) in the example(s) added in this PR.`, '');
    // Group problems by the file they belong to.
    const byFile = new Map();
    for (const p of problems) {
      const key = p.file;
      if (!byFile.has(key)) byFile.set(key, []);
      byFile.get(key).push(p.message);
    }
    for (const [file, msgs] of byFile) {
      lines.push(`**${pathLink(file)}**`, '');
      for (const m of msgs) lines.push(`- ${m}`);
      lines.push('');
    }
  }
  return lines.join('\n').trimEnd();
}

/** Write the markdown report and tell the workflow whether to post it. */
function emitReport(validated, ok) {
  const reportPath = process.env.VALIDATION_REPORT;
  const outPath = process.env.GITHUB_OUTPUT;
  // Comment only when we actually validated something in this PR.
  const shouldComment = validated.length > 0;
  if (shouldComment && reportPath) {
    fs.writeFileSync(reportPath, buildReport(validated, ok) + '\n');
  }
  if (outPath) {
    fs.appendFileSync(outPath, `should_comment=${shouldComment}\n`);
  }
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const validated = []; // human-readable names of what we validated

  if (args.length > 0) {
    // Explicit mode: validate the given directories as example roots.
    for (const arg of args) {
      const dir = path.resolve(repoRoot, arg);
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        fail(dir, arg, `${arg} is not a directory.`);
        continue;
      }
      validated.push(path.relative(repoRoot, dir) || arg);
      validateExampleRoot(dir);
    }
  } else {
    const { roots, subPackages } = collectAddedExampleRoots();

    if (roots.length === 0 && subPackages.length === 0) {
      console.log('No newly added example detected in this PR. Nothing to validate.');
      emitReport(validated, true);
      return;
    }

    for (const dir of roots) {
      const name = path.relative(repoRoot, dir) || '.';
      console.log(`Validating new example: ${name}`);
      validated.push(name);
      validateExampleRoot(dir);
    }
    // Sub-packages get the package.json field rules only (no README/.env.example).
    for (const dir of subPackages) {
      const name = path.relative(repoRoot, dir);
      console.log(`Validating sub-package: ${name}`);
      validated.push(name);
      validatePackageJson(path.join(dir, 'package.json'), false);
    }
  }

  const ok = problems.length === 0;
  emitReport(validated, ok);

  if (!ok) {
    console.error(`\n${problems.length} validation problem(s) found:\n`);
    for (const p of problems) {
      console.error(`  ✗ ${p.message}`);
    }
    process.exit(1);
  }

  console.log('\n✓ All checks passed.');
}

main();
