import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { accepted, rejected, sampleBody, SECRET, sign, vectors, vectorHeaders, type Vector } from '../../../test-support/vectors.js';
import { crosslyWebhook, type CrosslyEvent } from '../src/index.js';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

async function make(register: (app: FastifyInstance) => void | Promise<void>): Promise<FastifyInstance> {
  const app = Fastify();
  apps.push(app);
  await register(app);
  await app.ready();
  return app;
}

const signed = (body = sampleBody) => ({
  method: 'POST' as const,
  url: '/webhooks/crossly',
  headers: { 'content-type': 'application/json', 'crossly-signature': sign(body) },
  payload: body,
});

describe('@crossly/fastify: shared conformance vectors', () => {
  it(`covers all ${vectors.length} vectors (${rejected.length} must be rejected)`, () => {
    expect(vectors.length).toBeGreaterThanOrEqual(16);
    expect(rejected.length).toBeGreaterThanOrEqual(10);
  });

  const vectorApp = (v: Vector, seen: CrosslyEvent[]) =>
    make((app) => {
      app.register(crosslyWebhook, {
        secret: v.secret,
        now: () => v.now,
        toleranceSeconds: v.toleranceSeconds,
        onEvent: (event) => {
          seen.push(event);
        },
      });
    });

  it.each(accepted.map((v) => [v.name, v] as const))('accepts: %s', async (_name, v) => {
    const seen: CrosslyEvent[] = [];
    const app = await vectorApp(v, seen);
    const res = await app.inject({ method: 'POST', url: '/webhooks/crossly', headers: vectorHeaders(v), payload: Buffer.from(v.body, 'utf8') });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });
    expect(seen).toEqual([JSON.parse(v.body)]);
  });

  it.each(rejected.map((v) => [v.name, v] as const))('rejects with 400: %s', async (_name, v) => {
    const seen: CrosslyEvent[] = [];
    const app = await vectorApp(v, seen);
    const res = await app.inject({ method: 'POST', url: '/webhooks/crossly', headers: vectorHeaders(v), payload: Buffer.from(v.body, 'utf8') });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe(v.expect);
    expect(seen).toHaveLength(0);
  });
});

describe('@crossly/fastify: content-type parsers', () => {
  it("verifies raw bytes even though Fastify's root JSON parser is active, and leaves other routes parsing JSON", async () => {
    let got: CrosslyEvent | undefined;
    const app = await make((app) => {
      app.post('/other', async (request) => ({ parsed: request.body }));
      app.register(crosslyWebhook, {
        secret: SECRET,
        onEvent: (e) => {
          got = e;
        },
      });
    });
    const res = await app.inject(signed());
    expect(res.statusCode).toBe(200);
    expect(got?.type).toBe('sale.detected');
    const other = await app.inject({ method: 'POST', url: '/other', headers: { 'content-type': 'application/json' }, payload: '{"a":1}' });
    expect(other.json()).toEqual({ parsed: { a: 1 } });
  });

  it('accepts a content type with a charset, or none the root app knows', async () => {
    const app = await make((app) => {
      app.register(crosslyWebhook, { secret: SECRET, onEvent: () => {} });
    });
    const withCharset = signed();
    withCharset.headers['content-type'] = 'application/json; charset=utf-8';
    expect((await app.inject(withCharset)).statusCode).toBe(200);
    const odd = signed();
    odd.headers['content-type'] = 'text/plain';
    expect((await app.inject(odd)).statusCode).toBe(200);
  });

  it('honours a prefix and a custom path', async () => {
    const app = await make((app) => {
      app.register(crosslyWebhook, { prefix: '/hooks', path: '/crossly', secret: SECRET, onEvent: () => {} });
    });
    expect((await app.inject({ ...signed(), url: '/hooks/crossly' })).statusCode).toBe(200);
  });
});

describe('@crossly/fastify: behaviour', () => {
  it('lets the handler send its own reply, with a narrowed event type', async () => {
    const app = await make((app) => {
      app.register(crosslyWebhook, {
        secret: SECRET,
        onEvent: (event, _request, reply) => {
          if (event.type === 'sale.detected') return reply.code(202).send({ saleId: event.data.saleId });
          return undefined;
        },
      });
    });
    const res = await app.inject(signed());
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ saleId: 'sale_1' });
  });

  it('a throwing handler becomes a 500 so Crossly retries', async () => {
    const app = await make((app) => {
      app.register(crosslyWebhook, {
        secret: SECRET,
        onEvent: () => {
          throw new Error('db down');
        },
      });
    });
    expect((await app.inject(signed())).statusCode).toBe(500);
  });

  it('a missing secret is a 500 missing_secret', async () => {
    const app = await make((app) => {
      app.register(crosslyWebhook, { secret: undefined, onEvent: () => {} });
    });
    const res = await app.inject(signed());
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('missing_secret');
  });
});
