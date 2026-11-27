import { describe, expect, it } from 'vitest';
import { accepted, rejected, sampleBody, SECRET, sign, vectors, vectorHeaders } from '../../../test-support/vectors.js';
import { crosslyWebhookHandler, verifyCrosslyRequest, type CrosslyEvent } from '../src/index.js';

const URL_ = 'https://shop.example/api/webhooks/crossly';
const signed = (body = sampleBody) =>
  new Request(URL_, { method: 'POST', headers: { 'content-type': 'application/json', 'crossly-signature': sign(body) }, body });

describe('@crossly/next: shared conformance vectors', () => {
  it(`covers all ${vectors.length} vectors (${rejected.length} must be rejected)`, () => {
    expect(vectors.length).toBeGreaterThanOrEqual(16);
    expect(rejected.length).toBeGreaterThanOrEqual(10);
  });

  it.each(accepted.map((v) => [v.name, v] as const))('accepts: %s', async (_name, v) => {
    const seen: CrosslyEvent[] = [];
    const POST = crosslyWebhookHandler({ secret: v.secret, now: () => v.now, onEvent: (e) => void seen.push(e) });
    const res = await POST(new Request(URL_, { method: 'POST', headers: vectorHeaders(v), body: v.body }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(seen).toEqual([JSON.parse(v.body)]);
  });

  it.each(rejected.map((v) => [v.name, v] as const))('rejects with 400: %s', async (_name, v) => {
    const seen: CrosslyEvent[] = [];
    const POST = crosslyWebhookHandler({ secret: v.secret, now: () => v.now, onEvent: (e) => void seen.push(e) });
    const res = await POST(new Request(URL_, { method: 'POST', headers: vectorHeaders(v), body: v.body }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(v.expect);
    expect(seen).toHaveLength(0);
  });
});

describe('@crossly/next: behaviour', () => {
  it('reads the secret lazily, so a missing env var at build time is not fatal', async () => {
    let env: string | undefined;
    const POST = crosslyWebhookHandler({ secret: () => env, onEvent: () => {} });
    const before = await POST(signed());
    expect(before.status).toBe(500);
    expect(((await before.json()) as { error: { code: string } }).error.code).toBe('missing_secret');
    env = SECRET;
    expect((await POST(signed())).status).toBe(200);
  });

  it('passes the delivery id and narrows the event type', async () => {
    const POST = crosslyWebhookHandler({
      secret: SECRET,
      onEvent: (event, { deliveryId }) => {
        if (event.type === 'sale.detected') return Response.json({ saleId: event.data.saleId, deliveryId }, { status: 202 });
        return undefined;
      },
    });
    const req = signed();
    req.headers.set('Crossly-Delivery-Id', 'dlv_1');
    const res = await POST(req);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ saleId: 'sale_1', deliveryId: 'dlv_1' });
  });

  it('a throwing handler rejects, which Next turns into a 500 (Crossly retries)', async () => {
    const POST = crosslyWebhookHandler({
      secret: SECRET,
      onEvent: () => {
        throw new Error('db down');
      },
    });
    await expect(POST(signed())).rejects.toThrow('db down');
  });

  it('verifyCrosslyRequest reports without throwing', async () => {
    expect((await verifyCrosslyRequest(signed(), SECRET)).ok).toBe(true);
    const bad = await verifyCrosslyRequest(signed(), 'other');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.rejection.body.error.code).toBe('bad_signature');
  });
});
