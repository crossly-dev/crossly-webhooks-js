# @crossly/express

[![npm](https://img.shields.io/npm/v/@crossly/express.svg)](https://www.npmjs.com/package/@crossly/express)
[![ci](https://github.com/crossly-dev/crossly-webhooks-js/actions/workflows/ci.yml/badge.svg)](https://github.com/crossly-dev/crossly-webhooks-js/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Receive [Crossly](https://crossly.net) webhooks in Express 4 or 5: raw-body signature verification, a typed event,
`400` on a bad signature.

```sh
npm install @crossly/express
```

```ts
import express from 'express';
import { crosslyWebhook } from '@crossly/express';

const app = express();

app.post(
  '/webhooks/crossly',
  crosslyWebhook({
    secret: process.env.CROSSLY_WEBHOOK_SECRET,
    onEvent: async (event) => {
      if (event.type === 'sale.detected') console.log(event.data.platform, event.data.salePrice);
    },
  }),
);

app.use(express.json()); // after the webhook route
app.listen(3000);
```

## Options

| Option | |
|---|---|
| `secret` | The endpoint's signing secret, or `(req) => secret`. Missing → `500 missing_secret`. |
| `onEvent(event, req, res)` | Your handler. Resolve → `200 {"received":true}` (unless you responded). Throw → Express error handler (5xx), Crossly retries. Omit it to use the middleware as a guard: it sets `req.crosslyEvent` and calls `next()`. |
| `onReject(rejection, req)` | Called before every 4xx/5xx rejection, for logging. |
| `toleranceSeconds` | Replay window, default 300. |
| `limit` | Max body bytes when the middleware reads the stream itself, default 1 MiB (`413` above it). |

`res.locals.crosslyDeliveryId` holds the `Crossly-Delivery-Id` header. Dedupe on `event.id`, which is the same on
every retry; log the delivery id.

## Gotchas

**Body parser order.** The signature covers the exact bytes. In order of preference:

1. Mount the webhook route **before** `app.use(express.json())`. The middleware reads the stream itself.
2. Or put `express.raw({ type: 'application/json' })` on the route.
3. Or, when a global JSON parser must run first, keep the bytes:

   ```ts
   import { keepRawBody } from '@crossly/express';
   app.use(express.json({ verify: keepRawBody }));
   ```

If a JSON parser consumed the stream and kept nothing, the middleware answers `500 raw_body_unavailable` with this
explanation. It never verifies `JSON.stringify(req.body)`: that does not round-trip and rejects genuine events.

**Respond fast.** Crossly aborts a delivery after 10 seconds and retries it. Put slow work on a queue and resolve.

**Express 4.** Async errors in `onEvent` are still caught and passed to `next(err)`; you do not need
`express-async-errors`.

**CommonJS.** The package is ESM. `require('@crossly/express')` works on Node 20.19+ and 22.12+ (`require(esm)`);
on older Node use `await import('@crossly/express')`.

Everything is exported from the package root, including the event types (`CrosslyEvent`, `CrosslyEventType`,
`CROSSLY_EVENT_TYPES`, and each payload interface). Part of
[crossly-webhooks-js](https://github.com/crossly-dev/crossly-webhooks-js); see its README for the other frameworks.

MIT
