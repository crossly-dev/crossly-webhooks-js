# Changelog

All notable changes to the packages in this repository. They are versioned together.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [0.1.0] - 2026-11-27

### Added

- `@crossly/express`: `crosslyWebhook()` middleware for Express 4 and 5, and `keepRawBody` for apps whose global `express.json()` must run first. Reads the stream itself when no body parser ran; answers `500 raw_body_unavailable` (never a misleading 400) when a parser threw the bytes away.
- `@crossly/fastify`: `crosslyWebhook` plugin for Fastify 4 and 5 that registers its route in an encapsulated context with a Buffer content-type parser, leaving the rest of the app parsing JSON.
- `@crossly/hono`: `crosslyWebhook()` middleware for Hono 4 on any runtime, with the secret readable from `c.env` (Cloudflare Workers).
- `@crossly/next`: `crosslyWebhookHandler()` App Router route handler for the Node.js and Edge runtimes, and `verifyCrosslyRequest()`.
- `@crossly/koa`: `crosslyWebhook()` middleware for Koa 2 and 3 that uses `ctx.request.rawBody` from `@koa/bodyparser`/`koa-bodyparser` or reads `ctx.req` itself.
- Typed events for every name in the published Crossly event catalog (69 including `test.ping`), with payload interfaces for the documented sales, order, listing, app-command, inventory, offer, message, connection and automation events.
- Every adapter: 400 for forged, tampered, stale or malformed deliveries; 500 for receiver misconfiguration; 200 `{"received":true}` after `onEvent` resolves.
- Tests running the 22 shared Crossly webhook conformance vectors (13 must be rejected) through a real instance of each framework, plus body-parser ordering tests; CI on Node 22 and 24, Express 4 / Fastify 4 / Koa 2, and the packed tarballs installed into a clean project on Node 20, 22 and 24.
- Release workflow: npm provenance, signed build attestations on every tarball, GitHub Release with checksums.

[0.1.0]: https://github.com/crossly-dev/crossly-webhooks-js/releases/tag/v0.1.0
