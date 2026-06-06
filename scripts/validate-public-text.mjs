#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checkedRoots = ['README.md', 'index.html', 'src'];
const blockedPatterns = [
  { pattern: /\bsupposed to\b/i, label: 'supposed to' },
  { pattern: /\bintended to\b/i, label: 'intended to' },
  { pattern: /\bprivate admin repo\b/i, label: 'private admin repo' },
  { pattern: /\bpsychic-system\b/i, label: 'private repository name' },
  { pattern: /\battempt\.\d+\b/i, label: 'attempt-numbered artifact naming' }
];

function walk(target) {
  const full = path.join(root, target);
  if (!fs.existsSync(full)) return [];
  const stat = fs.statSync(full);
  if (stat.isFile()) return [full];
  const out = [];
  for (const name of fs.readdirSync(full)) {
    if (['node_modules', 'dist', 'target', '.git'].includes(name)) continue;
    out.push(...walk(path.join(target, name)));
  }
  return out;
}

const textExtensions = new Set(['.md', '.html', '.tsx', '.ts', '.css', '.json', '.yml', '.yaml']);
const failures = [];
for (const file of checkedRoots.flatMap(walk)) {
  if (!textExtensions.has(path.extname(file))) continue;
  const rel = path.relative(root, file).replaceAll('\\\\', '/');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const { pattern, label } of blockedPatterns) {
      if (pattern.test(line)) {
        failures.push(`${rel}:${index + 1}: blocked public wording (${label}): ${line.trim()}`);
      }
    }
  });
}

if (failures.length) {
  console.error('Public text validation failed:');
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Public text validation passed.');
