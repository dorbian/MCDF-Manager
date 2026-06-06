#!/usr/bin/env node
import fs from 'node:fs';

const refName = process.env.GITHUB_REF_NAME || process.argv[2] || '';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = process.env.RELEASE_VERSION || refName.replace(/^client-v/, '').replace(/^v/, '');

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Release version '${version}' is not a semantic version. Use tags like client-v0.1.23.`);
  process.exit(1);
}

if (process.env.REQUIRE_PACKAGE_VERSION_MATCH === 'true' && pkg.version !== version) {
  console.error(`package.json version '${pkg.version}' does not match release version '${version}'.`);
  console.error('Update package.json before tagging the release.');
  process.exit(1);
}

const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const hasExact = new RegExp(`^##\\s+(?:v)?${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'm').test(changelog);
const hasAnyEntry = /^##\s+/m.test(changelog);
if (!hasExact && process.env.REQUIRE_CHANGELOG_VERSION_MATCH === 'true') {
  console.error(`CHANGELOG.md does not contain an entry for ${version}.`);
  process.exit(1);
}
if (!hasAnyEntry) {
  console.error('CHANGELOG.md does not contain any release entries.');
  process.exit(1);
}

console.log(version);
