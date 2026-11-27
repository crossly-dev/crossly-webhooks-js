# @crossly/next

[![npm](https://img.shields.io/npm/v/@crossly/next.svg)](https://www.npmjs.com/package/@crossly/next)
[![ci](https://github.com/crossly-dev/crossly-webhooks-js/actions/workflows/ci.yml/badge.svg)](https://github.com/crossly-dev/crossly-webhooks-js/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Receive [Crossly](https://crossly.net) webhooks in a Next.js App Router route handler, on the Node.js or Edge runtime.

```sh
npm install @crossly/next
```

```ts
// app/api/webhooks/crossly/route.ts
import { crosslyWebhookHandler } from '@crossly/next';

export const POST = crosslyWebhookHandler({
  secret: () => process.env.CROSSLY_WEBHOOK_SECRET,
  onEvent: async (event, { deliveryId }) => {
    switch (event.type) {
      case 'listing.price_changed':
        console.log(event.data.listingId, event.data.oldPrice, '→', event.data.newPrice, deliveryId);
        break;
      default:
        break;
    }
  },
});
```

## Options

| Option | |
|---|---|
| `secret` | The signing secret, or `() => secret` (preferred: read per request). Missing → `500 missing_secret`. |
| `onEvent(event, { request, deliveryId })` | Return a `Response` to answer with it; otherwise `200 {"received":true}`. Throw → Next answers 500, Crossly retries. |
| `onReject(rejection, request)` | Called before every rejection, for logging. |
| `toleranceSeconds` | Replay window, default 300. |

`verifyCrosslyRequest(request, secret)` returns `{ ok, event | rejection }` without throwing, for handlers that do
more than receive webhooks.

## Gotchas

**Never `await request.json()` first.** It consumes the body; the handler reads `request.arrayBuffer()` itself.

**Pages Router.** `pages/api/*` routes parse the body by default. Use the App Router, or turn the parser off with
`export const config = { api: { bodyParser: false } }` and build a `Request` yourself.

**Secrets at build time.** Pass the secret as a function. Reading `process.env` lazily means a missing variable during
`next build` is not an error, and a missing one at runtime is a clear `500 missing_secret`.

**Middleware.** Next.js middleware that reads the body, or rewrites the route, runs before this handler. Exclude the
webhook path from your `matcher`.

**No `next` import.** The handler is plain `(Request) => Promise<Response>`, so it also works for React Router/Remix
actions, SvelteKit and Astro endpoints, `Bun.serve` and `Deno.serve`.

Part of [crossly-webhooks-js](https://github.com/crossly-dev/crossly-webhooks-js). MIT.
