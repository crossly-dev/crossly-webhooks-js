import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { accepted, rejected, sampleBody, SECRET, sign, vectors, vectorHeaders, type Vector } from '../../../test-support/vectors.js';
import { crosslyWebhook, type CrosslyEvent, type CrosslyVariables } from '../src/index.js';

const signed = (body = sampleBody): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', 'crossly-signature': sign(body) },
  body,
});

function vectorApp(v: Vector, seen: CrosslyEvent[]) {
  const app = new Hono();
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

describe('@crossly/hono: shared conformance vectors', () => {
  it(`covers all ${vectors.length} vectors (${rejected.length} must be rejected)`, () => {
    expect(vectors.length).toBeGreaterThanOrEqual(16);
    expect(rejected.length).toBeGreaterThanOrEqual(10);
  });

  it.each(accepted.map((v) => [v.name, v] as const))('accepts: %s', async (_name, v) => {
    const seen: CrosslyEvent[] = [];
    const res = await vectorApp(v, seen).request('/webhooks/crossly', { method: 'POST', headers: vectorHeaders(v), body: v.body });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(seen).toEqual([JSON.parse(v.body)]);
  });

  it.each(rejected.map((v) => [v.name, v] as const))('rejects with 400: %s', async (_name, v) => {
    const seen: CrosslyEvent[] = [];
    const res = await vectorApp(v, seen).request('/webhooks/crossly', { method: 'POST', headers: vectorHeaders(v), body: v.body });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(v.expect);
    expect(seen).toHaveLength(0);
  });
});

describe('@crossly/hono: behaviour', () => {
  it('reads the secret from c.env (Cloudflare Workers bindings)', async () => {
    type Bindings = { CROSSLY_WEBHOOK_SECRET: string };
    const app = new Hono<{ Bindings: Bindings }>();
    app.post('/webhooks/crossly', crosslyWebhook<{ Bindings: Bindings }>({ secret: (c) => c.env.CROSSLY_WEBHOOK_SECRET, onEvent: () => {} }));
    const ok = await app.request('/webhooks/crossly', signed(), { CROSSLY_WEBHOOK_SECRET: SECRET });
    expect(ok.status).toBe(200);
    const wrong = await app.request('/webhooks/crossly', signed(), { CROSSLY_WEBHOOK_SECRET: 'not-it' });
    expect(wrong.status).toBe(400);
  });

  it('guard mode exposes c.get("crosslyEvent") and leaves the body readable', async () => {
    const app = new Hono<{ Variables: CrosslyVariables }>();
    app.post('/webhooks/crossly', crosslyWebhook({ secret: SECRET }), async (c) => {
      const event = c.get('crosslyEvent');
      const again = (await c.req.json()) as { id: string };
      if (event.type === 'sale.detected') return c.json({ saleId: event.data.saleId, id: again.id }, 202);
      return c.body(null, 204);
    });
    const res = await app.request('/webhooks/crossly', signed());
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ saleId: 'sale_1', id: 'evt_adapter_test' });
  });

  it('returns the Response onEvent gives back', async () => {
    const app = new Hono();
    app.post('/webhooks/crossly', crosslyWebhook({ secret: SECRET, onEvent: () => new Response('queued', { status: 202 }) }));
    const res = await app.request('/webhooks/crossly', signed());
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('queued');
  });

  it('a throwing handler becomes a 500 so Crossly retries', async () => {
    const app = new Hono();
    app.post(
      '/webhooks/crossly',
      crosslyWebhook({
        secret: SECRET,
        onEvent: () => {
          throw new Error('db down');
        },
      }),
    );
    expect((await app.request('/webhooks/crossly', signed())).status).toBe(500);
  });

  it('a missing secret is a 500 missing_secret', async () => {
    const app = new Hono();
    app.post('/webhooks/crossly', crosslyWebhook({ secret: undefined, onEvent: () => {} }));
    const res = await app.request('/webhooks/crossly', signed());
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('missing_secret');
  });
});
