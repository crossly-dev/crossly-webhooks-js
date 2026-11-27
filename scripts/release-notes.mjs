#!/usr/bin/env node
// Prints the GitHub Release body for a tag: its CHANGELOG.md section, then how to
// verify the attached tarballs' build provenance.
//
//   node scripts/release-notes.mjs v0.1.0
import { readFileSync } from 'node:fs';

const tag = process.argv[2];
if (!tag) {
  console.error('usage: release-notes.mjs <tag>');
  process.exit(2);
}
const version = tag.replace(/^v/, '');
const lines = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').split(/\r?\n/);
const start = lines.findIndex((l) => new RegExp(`^## \\[?${version.replace(/\./g, '\\.')}\\]?`).test(l));
let section = [];
if (start !== -1) {
  for (const line of lines.slice(start + 1)) {
    if (/^## /.test(line)) break;
    section.push(line);
  }
}
const body = section.join('\n').trim() || 'See CHANGELOG.md.';
const repo = process.env.GITHUB_REPOSITORY ?? 'crossly-dev/crossly-webhooks-js';
console.log(`${body}

### Verifying the tarballs

Every \`.tgz\` attached here was built by this repository's release workflow and carries a signed
build provenance attestation:

\`\`\`sh
gh release download ${tag} -R ${repo}
for f in *.tgz; do gh attestation verify "$f" -R ${repo}; done
sha256sum -c SHA256SUMS.txt
\`\`\`
`);
