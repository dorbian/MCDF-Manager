#!/usr/bin/env node
import fs from 'node:fs';

const version = process.env.RELEASE_VERSION || process.argv[2] || '0.0.0';
const tag = process.env.TAG_NAME || `client-v${version}`;
const runUrl = process.env.RUN_URL || '';
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const lines = changelog.split(/\r?\n/);
let start = lines.findIndex((line) => line.startsWith('## '));
let end = -1;
if (start >= 0) {
  end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
}
let latest = start >= 0 ? lines.slice(start, end > -1 ? end : undefined).join('\n').trim() : 'No changelog entry found.';
latest = latest.replace(/^##\s+[^\n]+\n+/, '').trim();
const body = `# MCDF Manager ${version}

This release contains official MCDF Manager desktop client builds.

## Highlights and fixes

${latest}

## Downloads

Download the asset for your operating system from this release. Platform bundles use official MCDF Manager names and include the target platform and version.

## Integrity files

- \`checksums.txt\` contains SHA-256 hashes for uploaded platform bundles.
- \`release-manifest.json\` contains build metadata, commit, tag, asset names, sizes, and hashes.

## Known issues and bug reports

Known issues are tracked in GitHub Issues and summarized in the changelog when they affect a release. Use the bug report template when reporting a reproducible problem.
${runUrl ? `\nBuild run: ${runUrl}\n` : ''}`;
fs.writeFileSync('release-body.md', body);
console.log(`Generated release-body.md for ${tag}.`);
