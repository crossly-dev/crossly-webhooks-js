#!/usr/bin/env node
// Copies shared/*.ts into every package's src/_shared/ so each published package
// is self-contained (one runtime dependency, @crossly/sdk) while the event types
// and the verify logic have exactly one source.
//
//   node scripts/sync-shared.mjs          write the copies
//   node scripts/sync-shared.mjs --check  exit 1 if any copy is stale (CI runs this)
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sharedDir = join(root, 'shared');
const packagesDir = join(root, 'packages');
const check = process.argv.includes('--check');

const files = readdirSync(sharedDir).filter((f) => f.endsWith('.ts')).sort();
const packages = readdirSync(packagesDir).filter((p) => existsSync(join(packagesDir, p, 'package.json'))).sort();

let stale = 0;
for (const pkg of packages) {
  const outDir = join(packagesDir, pkg, 'src', '_shared');
  if (!check) mkdirSync(outDir, { recursive: true });
  for (const file of files) {
    const source = readFileSync(join(sharedDir, file), 'utf8').replace(/\r\n/g, '\n');
    const banner =
      `// GENERATED from shared/${file} by scripts/sync-shared.mjs. Do not edit here:\n` +
      `// edit shared/${file} and run \`npm run sync\`.\n`;
    const want = banner + source;
    const target = join(outDir, file);
    const have = existsSync(target) ? readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : null;
    if (have === want) continue;
    if (check) {
      console.error(`stale: packages/${pkg}/src/_shared/${file}`);
      stale += 1;
    } else {
      writeFileSync(target, want);
      console.log(`wrote packages/${pkg}/src/_shared/${file}`);
    }
  }
}
if (check && stale) {
  console.error(`\n${stale} shared file(s) out of date. Run \`npm run sync\` and commit the result.`);
  process.exit(1);
}
if (check) console.log(`shared copies are current (${files.length} files x ${packages.length} packages)`);
