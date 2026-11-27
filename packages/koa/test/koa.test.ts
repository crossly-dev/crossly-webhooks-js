import { bodyParser } from '@koa/bodyparser';
import Koa from 'koa';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { accepted, rejected, sampleBody, SECRET, sign, vectors, vectorHeaders, type Vector } from '../../../test-support/vectors.js';
import { crosslyWebhook, type CrosslyEvent } from '../src/index.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

async function listen(app: Koa): Promise<string> {
  const server = createServer(app.callback()).listen(0);
  servers.push(server);
  await new Promise<void>((r) => server.once('listening', () => r()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const post = (base: string, body = sampleBody, path = '/webhooks/crossly') =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'crossly-signature': sign(body) }, body });

const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

function vectorApp(v: Vector, seen: CrosslyEvent[]): Koa {
  const app = new Koa();
  app.use(
    crosslyWebhook({
      path: '/webhooks/crossly',
      secret: v.secret,
      now: () => v.now,
      toleranceSeconds: v.toleranceSeconds,
      onEvent: (event) => {
        seen.push(event);
      },
    }),
  );
  return app;
}

describe('@crossly/koa: shared conformance vectors', () => {
  it(`covers all ${vectors.length} vectors (${rejected.length} must be rejected)`, () => {
    expect(vectors.length).toBeGreaterThanOrEqual(16);
    expect(rejected.length).toBeGreaterThanOrEqual(10);
  });

  it.each(accepted.map((v) => [v.name, v] as const))('accepts: %s', async (_name, v) => {
    const seen: CrosslyEvent[] = [];
    const base = await listen(vectorApp(v, seen));
    const res = await fetch(`${base}/webhooks/crossly`, { method: 'POST', headers: vectorHeaders(v), body: v.body });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(seen).toEqual([JSON.parse(v.body)]);
  });

  it.each(rejected.map((v) => [v.name, v] as const))('rejects with 400: %s', async (_name, v) => {
    const seen: CrosslyEvent[] = [];
    const base = await listen(vectorApp(v, seen));
    const res = await fetch(`${base}/webhooks/crossly`, { method: 'POST', headers: vectorHeaders(v), body: v.body });
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe(v.expect);
    expect(seen).toHaveLength(0);
  });
});

describe('@crossly/koa: body parser ordering', () => {
  it('works mounted before any body parser (reads ctx.req itself)', async () => {
    const app = new Koa();
    app.use(crosslyWebhook({ path: '/webhooks/crossly', secret: SECRET, onEvent: () => {} }));
    app.use(bodyParser());
    expect((await post(await listen(app))).status).toBe(200);
  });

  it('works behind @koa/bodyparser, using the rawBody it keeps', async () => {
    const app = new Koa();
    app.use(bodyParser());
    let got: CrosslyEvent | undefined;
    app.use(
      crosslyWebhook({
        path: '/webhooks/crossly',
        secret: SECRET,
        onEvent: (e) => {
          got = e;
        },
      }),
    );
    expect((await post(await listen(app))).status).toBe(200);
    expect(got?.type).toBe('sale.detected');
  });

  it('answers 500 raw_body_unavailable when a parser consumed the stream and kept nothing', async () => {
    const app = new Koa();
    app.use(async (ctx, next) => {
      for await (const _chunk of ctx.req) {
        // a parser that throws the bytes away
      }
      await next();
    });
    app.use(crosslyWebhook({ path: '/webhooks/crossly', secret: SECRET, onEvent: () => {} }));
    const res = await post(await listen(app));
    expect(res.status).toBe(500);
    expect(await codeOf(res)).toBe('raw_body_unavailable');
  });
});

describe('@crossly/koa: behaviour', () => {
  it('passes other paths and methods through to next()', async () => {
    const app = new Koa();
    app.use(crosslyWebhook({ path: '/webhooks/crossly', secret: SECRET, onEvent: () => {} }));
    app.use((ctx) => {
      ctx.body = { passed: ctx.path };
    });
    const base = await listen(app);
    expect(await (await fetch(`${base}/other`)).json()).toEqual({ passed: '/other' });
    expect(await (await fetch(`${base}/webhooks/crossly`)).json()).toEqual({ passed: '/webhooks/crossly' });
  });

  it('guard mode sets ctx.state.crosslyEvent', async () => {
    const app = new Koa();
    app.use(crosslyWebhook({ path: '/webhooks/crossly', secret: SECRET }));
    app.use((ctx) => {
      const event = ctx.state.crosslyEvent as CrosslyEvent;
      ctx.status = 202;
      ctx.body = { type: event.type };
    });
    const res = await post(await listen(app));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ type: 'sale.detected' });
  });

  it('a throwing handler becomes a 500 so Crossly retries', async () => {
    const app = new Koa();
    app.silent = true;
    app.use(
      crosslyWebhook({
        path: '/webhooks/crossly',
        secret: SECRET,
        onEvent: () => {
          throw new Error('db down');
        },
      }),
    );
    expect((await post(await listen(app))).status).toBe(500);
  });

  it('a missing secret is a 500 missing_secret', async () => {
    const app = new Koa();
    app.use(crosslyWebhook({ path: '/webhooks/crossly', secret: undefined, onEvent: () => {} }));
    const res = await post(await listen(app));
    expect(res.status).toBe(500);
    expect(await codeOf(res)).toBe('missing_secret');
  });
});
