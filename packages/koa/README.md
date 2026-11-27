# @crossly/koa

[![npm](https://img.shields.io/npm/v/@crossly/koa.svg)](https://www.npmjs.com/package/@crossly/koa)
[![ci](https://github.com/crossly-dev/crossly-webhooks-js/actions/workflows/ci.yml/badge.svg)](https://github.com/crossly-dev/crossly-webhooks-js/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Receive [Crossly](https://crossly.net) webhooks in Koa 2 or 3: raw-body verification, a typed event, `400` on a bad
signature.

```sh
npm install @crossly/koa
```

```ts
import Koa from 'koa';
import { crosslyWebhook } from '@crossly/koa';

const app = new Koa();

app.use(
  crosslyWebhook({
    path: '/webhooks/crossly',
    secret: process.env.CROSSLY_WEBHOOK_SECRET,
    onEvent: async (event) => {
      if (event.type === 'inventory.quantity_changed' && event.data.soldOut) console.log('sold out', event.data.sku);
    },
  }),
);

app.listen(3000);
```

With `@koa/router`, drop `path` and mount it on the route:
`router.post('/webhooks/crossly', crosslyWebhook({ secret, onEvent }))`.

## Options

| Option | |
|---|---|
| `secret` | The signing secret, or `(ctx) => secret`. Missing → `500 missing_secret`. |
| `path` | Only handle `POST` to this path; everything else goes to `next()`. |
| `onEvent(event, ctx)` | Resolve with no `ctx.body` → `200 {"received":true}`. Throw → 500, Crossly retries. Omit it for guard mode: `ctx.state.crosslyEvent`. |
| `onReject(rejection, ctx)` | Called before every rejection, for logging. |
| `toleranceSeconds` | Replay window, default 300. |
| `limit` | Max body bytes when it reads the stream itself, default 1 MiB. |

## Gotchas

**Body parsers.** `@koa/bodyparser` and `koa-bodyparser` consume `ctx.req`, but both keep the original text on
`ctx.request.rawBody`, which is what this verifies. Before any body parser, it reads `ctx.req` itself. A parser that
consumes the stream and keeps no raw copy (some multipart and custom parsers) leaves nothing to verify; you then get
`500 raw_body_unavailable`. Mount the webhook first.

**Respond fast.** Crossly aborts after 10 seconds and retries. Queue slow work.

Part of [crossly-webhooks-js](https://github.com/crossly-dev/crossly-webhooks-js). MIT.
