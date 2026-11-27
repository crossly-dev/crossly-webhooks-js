import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { accepted, rejected, sampleBody, SECRET, sign, vectors, vectorHeaders, type Vector } from '../../../test-support/vectors.js';
import { crosslyWebhook, keepRawBody, type CrosslyEvent } from '../src/index.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

async function listen(app: Express): Promise<string> {
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((r) => server.once('listening', () => r()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function vectorApp(v: Vector, seen: CrosslyEvent[]): Express {
  const app = express();
  app.post(
    '/webhooks/crossly',
    crosslyWebhook({
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

const post = (base: string, body = sampleBody, header = sign(body)) =>
  fetch(`${base}/webhooks/crossly`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'crossly-signature': header },
    body,
  });

const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

describe('@crossly/express: shared conformance vectors', () => {
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

describe('@crossly/express: body parser ordering', () => {
  it('works with no body parser at all (reads the stream itself)', async () => {
    const app = express();
    app.post('/webhooks/crossly', crosslyWebhook({ secret: SECRET, onEvent: () => {} }));
    expect((await post(await listen(app))).status).toBe(200);
  });

  it('works behind express.raw() on the route', async () => {
    const app = express();
    app.post('/webhooks/crossly', express.raw({ type: 'application/json' }), crosslyWebhook({ secret: SECRET, onEvent: () => {} }));
    expect((await post(await listen(app))).status).toBe(200);
  });

  it('works when the webhook route is mounted BEFORE a global express.json()', async () => {
    const app = express();
    app.post('/webhooks/crossly', crosslyWebhook({ secret: SECRET, onEvent: () => {} }));
    app.use(express.json());
    app.post('/other', (req, res) => {
      res.json({ parsed: req.body });
    });
    const base = await listen(app);
    expect((await post(base)).status).toBe(200);
    const other = await fetch(`${base}/other`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":1}' });
    expect(await other.json()).toEqual({ parsed: { a: 1 } });
  });

  it('works behind a global express.json({ verify: keepRawBody })', async () => {
    const app = express();
    app.use(express.json({ verify: keepRawBody }));
    app.post('/webhooks/crossly', crosslyWebhook({ secret: SECRET, onEvent: () => {} }));
    expect((await post(await listen(app))).status).toBe(200);
  });

  it('answers 500 raw_body_unavailable (not a misleading 400) behind a plain global express.json()', async () => {
    const app = express();
    app.use(express.json());
    app.post('/webhooks/crossly', crosslyWebhook({ secret: SECRET, onEvent: () => {} }));
    const res = await post(await listen(app));
    expect(res.status).toBe(500);
    expect(await codeOf(res)).toBe('raw_body_unavailable');
  });

  it('verifies the bytes as sent, whatever their key order', async () => {
    const app = express();
    app.use(express.json({ verify: keepRawBody }));
    let got: CrosslyEvent | undefined;
    app.post(
      '/webhooks/crossly',
      crosslyWebhook({
        secret: SECRET,
        onEvent: (e) => {
          got = e;
        },
      }),
    );
    const reordered = '{"type":"test.ping","id":"evt_1","data":{"message":"hi","timestamp":"x"},"created":"2026-11-27T00:00:00Z"}';
    expect((await post(await listen(app), reordered)).status).toBe(200);
    expect(got?.type).toBe('test.ping');
  });
});

describe('@crossly/express: behaviour', () => {
  it('guard mode sets req.crosslyEvent and calls next(), with a narrowed event type', async () => {
    const app = express();
    app.post('/webhooks/crossly', crosslyWebhook({ secret: SECRET }), (req, res) => {
      const event = req.crosslyEvent!;
      if (event.type === 'sale.detected') res.status(202).json({ saleId: event.data.saleId });
      else res.sendStatus(204);
    });
    const res = await post(await listen(app));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ saleId: 'sale_1' });
  });

  it('a throwing handler becomes a 500 so Crossly retries', async () => {
    const app = express();
    app.post(
      '/webhooks/crossly',
      crosslyWebhook({
        secret: SECRET,
        onEvent: () => {
          throw new Error('db down');
        },
      }),
    );
    app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: 'handler failed' });
    });
    expect((await post(await listen(app))).status).toBe(500);
  });

  it('a missing secret is a 500 missing_secret, not a 400', async () => {
    const app = express();
    app.post('/webhooks/crossly', crosslyWebhook({ secret: undefined, onEvent: () => {} }));
    const res = await post(await listen(app));
    expect(res.status).toBe(500);
    expect(await codeOf(res)).toBe('missing_secret');
  });

  it('rejects an oversized body with 413', async () => {
    const app = express();
    app.post('/webhooks/crossly', crosslyWebhook({ secret: SECRET, limit: 64, onEvent: () => {} }));
    const big = JSON.stringify({ id: 'x', type: 'test.ping', created: '', data: { pad: 'x'.repeat(500) } });
    expect((await post(await listen(app), big)).status).toBe(413);
  });
});
