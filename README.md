# Crossly webhooks for JavaScript frameworks

[![ci](https://github.com/crossly-dev/crossly-webhooks-js/actions/workflows/ci.yml/badge.svg)](https://github.com/crossly-dev/crossly-webhooks-js/actions/workflows/ci.yml)
[![release](https://github.com/crossly-dev/crossly-webhooks-js/actions/workflows/release.yml/badge.svg)](https://github.com/crossly-dev/crossly-webhooks-js/actions/workflows/release.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![provenance](https://img.shields.io/badge/npm-provenance-2ea44f)](#verifying-what-you-install)

Receive [Crossly](https://crossly.net) webhooks in one line, in the framework you already use. Each adapter
verifies the `Crossly-Signature` header over the **exact bytes** Crossly sent, hands you a typed event, and answers
`400` when the signature is wrong.

| Package | Framework | One line |
|---|---|---|
| [`@crossly/express`](packages/express) | Express 4, 5 | `app.post('/webhooks/crossly', crosslyWebhook({ secret, onEvent }))` |
| [`@crossly/fastify`](packages/fastify) | Fastify 4, 5 | `app.register(crosslyWebhook, { secret, onEvent })` |
| [`@crossly/hono`](packages/hono) | Hono 4 (Workers, Bun, Deno, Node) | `app.post('/webhooks/crossly', crosslyWebhook({ secret, onEvent }))` |
| [`@crossly/next`](packages/next) | Next.js App Router (Node + Edge) | `export const POST = crosslyWebhookHandler({ secret, onEvent })` |
| [`@crossly/koa`](packages/koa) | Koa 2, 3 | `app.use(crosslyWebhook({ path, secret, onEvent }))` |

Verification itself is [`verifyWebhook`](https://github.com/crossly-dev/crossly-sdk) from `@crossly/sdk`, the
package's only runtime dependency. These adapters add what goes wrong around it: getting the raw body out of each
framework, the status codes, and the types.

## Install

```sh
npm install @crossly/express      # or @crossly/fastify, @crossly/hono, @crossly/next, @crossly/koa
```

## First working example (Express)

```ts
import express from 'express';
import { crosslyWebhook } from '@crossly/express';

const app = express();

// Mount the webhook route BEFORE app.use(express.json()). See "Body parsers" below.
app.post(
  '/webhooks/crossly',
  crosslyWebhook({
    secret: process.env.CROSSLY_WEBHOOK_SECRET,
    onEvent: async (event) => {
      switch (event.type) {
        case 'sale.detected':
          console.log(`Sold on ${event.data.platform} for $${event.data.salePrice}`);
          break;
        case 'order.created':
          if (event.data.addressPending) break; // wait for order.address_available
          console.log('Ship to', event.data.buyerAddress);
          break;
        case 'test.ping':
          console.log('Crossly says hello');
          break;
        default:
          // New event types ship without a code change on your side: log and ignore.
          console.log('unhandled', event.type);
      }
    },
  }),
);

app.use(express.json()); // the rest of your app

app.listen(3000);
```

Register the endpoint in **Settings → API & webhooks → Webhooks** (or `POST /v1/webhooks`), copy the signing secret
(shown once), and press **Send test**. While building locally, `crossly dev --forward http://localhost:3000/webhooks/crossly`
forwards live events to your machine without a tunnel.

## What every adapter does

- Reads the **raw** request body and verifies `t=<unix>,v1=<hex HMAC-SHA256 of "t.rawBody">` in constant time, with a
  300-second replay window (`toleranceSeconds` to change it).
- Answers **400** `{ "error": { "code", "message" } }` for a forged, tampered, stale or malformed delivery. `code` is
  `bad_signature`, `timestamp_out_of_tolerance`, `malformed_header` or `invalid_payload`.
- Answers **500** for problems on your side (`missing_secret`, `raw_body_unavailable`), so Crossly keeps retrying
  until you fix them instead of you losing the event.
- Calls `onEvent(event, …)` with a typed `CrosslyEvent`: `switch (event.type)` narrows `event.data`. All 69 event
  names in the [event catalog](https://crossly.net/docs/api-webhooks) are in `CROSSLY_EVENT_TYPES`.
- Answers **200** `{"received":true}` when `onEvent` resolves, unless you sent a response yourself. If `onEvent`
  throws you get a 5xx and Crossly retries (5 attempts, exponential backoff from 5 s, 10 s timeout per attempt).

## Body parsers: the mistake this exists to prevent

The signature is over bytes. `JSON.stringify(JSON.parse(body))` does not give the same bytes back (key order, number
formatting, Unicode escapes), so verifying a parsed body fails on genuine events, and the usual "fix" is to stop
verifying. Each framework hides the raw body differently:

| Framework | What goes wrong | What the adapter does |
|---|---|---|
| Express | A global `app.use(express.json())` above the route consumes the stream. | Uses `express.raw()`'s Buffer, or `req.rawBody` from `express.json({ verify: keepRawBody })`, or reads the stream itself when no parser ran. If a parser threw the bytes away it answers `500 raw_body_unavailable` with the fix, never a misleading 400. |
| Fastify | The root `application/json` parser runs before every handler. | Registers its route in its own encapsulated context with a Buffer parser. Your other routes keep normal JSON parsing. Do not wrap it in `fastify-plugin`. |
| Hono | Nothing: Hono never parses on its own. | Reads `c.req.arrayBuffer()`. Hono caches the body, so `c.req.json()` still works afterwards. |
| Next.js | `await request.json()` before verifying consumes the body. Pages Router API routes parse by default. | Reads `request.arrayBuffer()`. For the Pages Router set `export const config = { api: { bodyParser: false } }` (or use the App Router). |
| Koa | `koa-bodyparser` / `@koa/bodyparser` consume `ctx.req`. | Uses the `ctx.request.rawBody` both of them keep, or reads `ctx.req` itself when it runs first. |

## Testing

Every adapter runs the shared Crossly webhook conformance vectors ([`test-vectors.json`](test-vectors.json): the same
22 cases every Crossly SDK verifier is checked against, 13 of which must be rejected) through a real instance of its
framework: Express and Koa over HTTP, Fastify via `inject`, Hono via `app.request`, Next with a real `Request`. CI also
installs the packed tarballs into a clean project on Node 20, 22 and 24 and runs every vector through every adapter
again, and tests Express 4, Fastify 4 and Koa 2.

```sh
npm install
npm run typecheck && npm run build && npm test
```

The event types and the verify logic live once in [`shared/`](shared) and are copied into each package by
`npm run sync` (CI fails if a copy is stale), so every package is self-contained with one runtime dependency.

## Verifying what you install

Releases are built by [`release.yml`](.github/workflows/release.yml) and published with npm provenance. Each GitHub
Release attaches the exact tarballs with a signed build attestation:

```sh
gh release download v0.1.0 -R crossly-dev/crossly-webhooks-js
gh attestation verify crossly-express-0.1.0.tgz -R crossly-dev/crossly-webhooks-js
```

## Links

- [Webhooks guide and event catalog](https://crossly.net/docs/api-webhooks)
- [`@crossly/sdk`](https://github.com/crossly-dev/crossly-sdk), the TypeScript SDK (`verifyWebhook` lives there)
- [`create-crossly-app`](https://github.com/crossly-dev/create-crossly-app), starter projects including webhook receivers
- [Crossly API docs](https://crossly.net/docs)
- Security issues: please use [private vulnerability reporting](https://github.com/crossly-dev/crossly-webhooks-js/security/advisories/new)

## License

[MIT](LICENSE)
