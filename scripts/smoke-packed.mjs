#!/usr/bin/env node
// Installs the PACKED tarballs into a fresh project, the way a user would get them
// from npm, and runs every conformance vector through every adapter on a real
// framework instance. Catches what unit tests cannot: a missing file in `files`,
// a broken `exports` map, a dependency that only resolved inside the workspace,
// and runtime differences on older Node lines (CI runs this on Node 20, 22 and 24).
//
//   node scripts/smoke-packed.mjs <dir containing the .tgz files>
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const tarDir = resolve(process.argv[2] ?? join(root, '.artifacts'));
const tarballs = readdirSync(tarDir).filter((f) => f.endsWith('.tgz')).map((f) => join(tarDir, f));
const expected = ['express', 'fastify', 'hono', 'next', 'koa'];
for (const name of expected) {
  if (!tarballs.some((t) => t.includes(`crossly-${name}-`))) throw new Error(`no tarball for @crossly/${name} in ${tarDir}`);
}

const work = mkdtempSync(join(tmpdir(), 'crossly-webhooks-smoke-'));
writeFileSync(join(work, 'package.json'), JSON.stringify({ name: 'smoke', private: true, type: 'module' }));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
execFileSync(
  npm,
  ['install', '--no-audit', '--no-fund', ...tarballs, 'express@^5', 'fastify@^5', 'hono@^4', 'koa@^3', '@koa/bodyparser@^6'],
  { cwd: work, stdio: 'inherit', shell: process.platform === 'win32' },
);

const vectors = JSON.parse(readFileSync(join(root, 'test-vectors.json'), 'utf8')).vectors;
writeFileSync(join(work, 'vectors.json'), JSON.stringify(vectors));
writeFileSync(
  join(work, 'smoke.mjs'),
  `
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import express from 'express';
import Fastify from 'fastify';
import { Hono } from 'hono';
import Koa from 'koa';
import { crosslyWebhook as expressHook, CROSSLY_EVENT_TYPES } from '@crossly/express';
import { crosslyWebhook as fastifyHook } from '@crossly/fastify';
import { crosslyWebhook as honoHook } from '@crossly/hono';
import { crosslyWebhookHandler } from '@crossly/next';
import { crosslyWebhook as koaHook } from '@crossly/koa';

const vectors = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url), 'utf8'));
const headersOf = (v) => (v.header === '' ? { 'content-type': 'application/json' } : { 'content-type': 'application/json', 'crossly-signature': v.header });
const want = (v) => (v.expect === 'ok' ? 200 : 400);
const listen = (handler) => new Promise((r) => { const s = createServer(handler).listen(0, () => r(s)); });
const viaServer = async (handler, v) => {
  const s = await listen(handler);
  try {
    const res = await fetch('http://127.0.0.1:' + s.address().port + '/webhooks/crossly', { method: 'POST', headers: headersOf(v), body: v.body });
    return { status: res.status, body: await res.json() };
  } finally { s.close(); }
};

const adapters = {
  express: (v) => { const app = express(); app.post('/webhooks/crossly', expressHook({ secret: v.secret, now: () => v.now, onEvent() {} })); return viaServer(app, v); },
  fastify: async (v) => {
    const app = Fastify(); app.register(fastifyHook, { secret: v.secret, now: () => v.now, onEvent() {} }); await app.ready();
    const res = await app.inject({ method: 'POST', url: '/webhooks/crossly', headers: headersOf(v), payload: Buffer.from(v.body, 'utf8') });
    await app.close(); return { status: res.statusCode, body: res.json() };
  },
  hono: async (v) => {
    const app = new Hono(); app.post('/webhooks/crossly', honoHook({ secret: v.secret, now: () => v.now, onEvent() {} }));
    const res = await app.request('/webhooks/crossly', { method: 'POST', headers: headersOf(v), body: v.body });
    return { status: res.status, body: await res.json() };
  },
  next: async (v) => {
    const POST = crosslyWebhookHandler({ secret: v.secret, now: () => v.now, onEvent() {} });
    const res = await POST(new Request('https://x.example/webhooks/crossly', { method: 'POST', headers: headersOf(v), body: v.body }));
    return { status: res.status, body: await res.json() };
  },
  koa: (v) => { const app = new Koa(); app.use(koaHook({ path: '/webhooks/crossly', secret: v.secret, now: () => v.now, onEvent() {} })); return viaServer(app.callback(), v); },
};

let failures = 0;
for (const [name, run] of Object.entries(adapters)) {
  let agree = 0;
  for (const v of vectors) {
    const got = await run(v);
    const ok = got.status === want(v) && (v.expect === 'ok' || got.body?.error?.code === v.expect);
    if (ok) agree += 1;
    else { failures += 1; console.log('  MISMATCH', name, v.name, JSON.stringify(got)); }
  }
  console.log('  @crossly/' + name + ': ' + agree + '/' + vectors.length + ' vectors agree');
}
if (CROSSLY_EVENT_TYPES.length < 60) { failures += 1; console.log('  event catalog missing from the published types'); }
console.log('node ' + process.version + ': ' + (failures ? failures + ' failure(s)' : 'all adapters agree on every vector'));
process.exit(failures ? 1 : 0);
`,
);
execFileSync(process.execPath, ['smoke.mjs'], { cwd: work, stdio: 'inherit' });
