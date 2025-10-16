#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.resolve(__dirname, '..', 'package.json');

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const litDependencies = Object.keys({
  ...packageJson.dependencies,
  ...packageJson.devDependencies
}).filter(name => name.startsWith('@lit-protocol/'));

if (litDependencies.length === 0) {
  console.log('✅ No @lit-protocol dependencies declared in package.json.');
  process.exit(0);
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
  entry => entry?.name && litDependencies.includes(entry.name)
);

if (litOutdated.length === 0) {
  console.log('✅ Nothing to update. All @lit-protocol packages are up to date.');
  process.exit(0);
}

console.log('⬆️ Updating @lit-protocol packages:\n');

for (const pkg of litOutdated) {
  const current = pkg.current ?? 'unknown';
  const target = pkg.latest ?? pkg.wanted ?? 'unknown';
  console.log(` - ${pkg.name}: ${current} → ${target}`);
}

const updateArgs = ['update', '--latest', ...litOutdated.map(pkg => pkg.name)];

console.log(`\n> pnpm ${updateArgs.join(' ')}`);

const updateResult = spawnSync('pnpm', updateArgs, {
  stdio: 'inherit'
});

if (updateResult.status !== 0) {
  console.error('\n❌ Failed to update @lit-protocol packages.');
  process.exit(updateResult.status ?? 1);
}

console.log('\n✅ Finished updating @lit-protocol packages.');
