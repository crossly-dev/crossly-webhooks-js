# @crossly/hono

[![npm](https://img.shields.io/npm/v/@crossly/hono.svg)](https://www.npmjs.com/package/@crossly/hono)
[![ci](https://github.com/crossly-dev/crossly-webhooks-js/actions/workflows/ci.yml/badge.svg)](https://github.com/crossly-dev/crossly-webhooks-js/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Receive [Crossly](https://crossly.net) webhooks in Hono, on Cloudflare Workers, Bun, Deno, Node or anywhere else Hono
runs. Web Crypto only, no Node APIs.

```sh
npm install @crossly/hono
```

```ts
import { Hono } from 'hono';
import { crosslyWebhook } from '@crossly/hono';

type Bindings = { CROSSLY_WEBHOOK_SECRET: string };
const app = new Hono<{ Bindings: Bindings }>();

app.post(
  '/webhooks/crossly',
  crosslyWebhook<{ Bindings: Bindings }>({
    secret: (c) => c.env.CROSSLY_WEBHOOK_SECRET,
    onEvent: async (event, c) => {
      if (event.type === 'message.received') {
        c.executionCtx.waitUntil(notify(event.data.messageBody)); // slow work after the 200
      }
    },
  }),
);

export default app;
```

## Options

| Option | |
|---|---|
| `secret` | The signing secret, or `(c) => secret`. Missing → `500 missing_secret`. |
| `onEvent(event, c)` | Return a `Response` to answer with it; otherwise `200 {"received":true}`. Throw → 500, Crossly retries. Omit it for guard mode: `c.get('crosslyEvent')` in the next handler. |
| `onReject(rejection, c)` | Called before every rejection, for logging. |
| `toleranceSeconds` | Replay window, default 300. |

Type the guard-mode variables with `new Hono<{ Variables: CrosslyVariables }>()`.

## Gotchas

**Workers secrets live on `c.env`.** There is no `process.env` at module scope on Workers; pass a function. Set it with
`wrangler secret put CROSSLY_WEBHOOK_SECRET`.

**Respond fast, then work.** Crossly aborts after 10 seconds. On Workers use `c.executionCtx.waitUntil()` for anything
slow; elsewhere, a queue.

**Raw body.** Hono never parses bodies by itself, so this always sees the signed bytes. It reads
`c.req.arrayBuffer()`; Hono caches it, and your own `c.req.json()` afterwards still works. Do not put a body-consuming
middleware of your own before it.

Part of [crossly-webhooks-js](https://github.com/crossly-dev/crossly-webhooks-js). MIT.
