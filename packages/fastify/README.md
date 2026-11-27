# @crossly/fastify

[![npm](https://img.shields.io/npm/v/@crossly/fastify.svg)](https://www.npmjs.com/package/@crossly/fastify)
[![ci](https://github.com/crossly-dev/crossly-webhooks-js/actions/workflows/ci.yml/badge.svg)](https://github.com/crossly-dev/crossly-webhooks-js/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Receive [Crossly](https://crossly.net) webhooks in Fastify 4 or 5: a raw-body route, a typed event, `400` on a bad
signature.

```sh
npm install @crossly/fastify
```

```ts
import Fastify from 'fastify';
import { crosslyWebhook } from '@crossly/fastify';

const app = Fastify({ logger: true });

await app.register(crosslyWebhook, {
  path: '/webhooks/crossly', // the default
  secret: process.env.CROSSLY_WEBHOOK_SECRET,
  onEvent: async (event, request) => {
    if (event.type === 'order.created') request.log.info({ orderId: event.data.orderId }, 'new order');
  },
});

await app.listen({ port: 3000 });
```

## Options

| Option | |
|---|---|
| `secret` | The signing secret, or `(request) => secret`. Missing → `500 missing_secret`. |
| `onEvent(event, request, reply)` | Required. Resolve → `200 {"received":true}` unless you sent a reply. Throw → 500, Crossly retries. |
| `path` | Route path, default `/webhooks/crossly`. `prefix` works as for any plugin. |
| `onReject(rejection, request)` | Called before every rejection, for logging. |
| `toleranceSeconds` | Replay window, default 300. |
| `bodyLimit` | Route body limit in bytes, default 1 MiB. |

`request.crosslyEvent` is typed on the webhook route.

## Gotchas

**Fastify parses JSON before your handler.** The parsed object cannot be turned back into the signed bytes. The plugin
registers its route inside its **own encapsulated context** and swaps the content-type parsers there for one that
keeps a Buffer. Your other routes are untouched and keep parsing JSON.

**Do not wrap it in `fastify-plugin`.** That strips the encapsulation, and the raw-body parser would then apply to
your whole app.

**Register, don't decorate a route.** Adding the handler to an existing route in the root context would get the
already-parsed body. Use the plugin's route (with `path`/`prefix`) instead.

**Respond fast.** Crossly aborts after 10 seconds and retries. Queue slow work.

Part of [crossly-webhooks-js](https://github.com/crossly-dev/crossly-webhooks-js). MIT.
