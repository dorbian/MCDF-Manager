#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const dir = process.argv[2] || 'packaged-assets';
const version = process.env.RELEASE_VERSION || process.env.VERSION || '0.0.0';
const tag = process.env.TAG_NAME || `client-v${version}`;
const assets = fs.readdirSync(dir)
  .filter((name) => name.endsWith('.zip'))
  .sort()
  .map((name) => {
    const file = path.join(dir, name);
    return {
      name,
      size_bytes: fs.statSync(file).size,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    };
  });

const manifest = {
  product: 'MCDF Manager',
  version,
  tag,
  commit: process.env.GITHUB_SHA || null,
  built_at: new Date().toISOString(),
  assets
};
fs.writeFileSync(path.join(dir, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${path.join(dir, 'release-manifest.json')}.`);
