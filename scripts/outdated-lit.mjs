#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

function parseOutdatedOutput(raw) {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    const results = [];
    for (const line of trimmed.split(/\r?\n/)) {
      const candidate = line.trim();
      if (!candidate) continue;
      try {
        const value = JSON.parse(candidate);
        if (Array.isArray(value)) {
          results.push(...value);
        } else {
          results.push(value);
        }
      } catch {
        // ignore non-JSON lines
      }
    }
    return results;
  }
}

const outdatedResult = spawnSync('pnpm', ['outdated', '--json'], {
  encoding: 'utf8'
});

if (outdatedResult.error) {
  console.error('❌ Failed to run pnpm outdated:', outdatedResult.error.message);
  process.exit(1);
}

if (![0, 1].includes(outdatedResult.status ?? 0)) {
  const message = outdatedResult.stderr?.trim() || 'Unknown pnpm error.';
  console.error('❌ pnpm outdated exited with an unexpected error.\n', message);
  process.exit(outdatedResult.status ?? 1);
}

const allOutdated = parseOutdatedOutput(outdatedResult.stdout);
const litOutdated = allOutdated.filter(
  entry => entry?.name && entry.name.startsWith('@lit-protocol/')
);

if (litOutdated.length === 0) {
  console.log('✅ No @lit-protocol packages are outdated.');
  process.exit(0);
}

console.log('📦 Outdated @lit-protocol packages:\n');

for (const pkg of litOutdated) {
  const current = pkg.current ?? 'unknown';
  const target = pkg.latest ?? pkg.wanted ?? 'unknown';
  console.log(` - ${pkg.name}: ${current} → ${target}`);
}

console.log('\nRun pnpm run update:lit to upgrade them.\n');
