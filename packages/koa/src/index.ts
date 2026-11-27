/**
 * @crossly/koa — a Crossly webhook receiver for Koa 2 and 3.
 *
 *   app.use(crosslyWebhook({
 *     path: '/webhooks/crossly',
 *     secret: process.env.CROSSLY_WEBHOOK_SECRET,
 *     onEvent: async (event, ctx) => { ... },
 *   }));
 *
 * It gets the exact signed bytes in whichever of these is true:
 *
 *   1. It runs before any body parser: it reads `ctx.req` itself.
 *   2. `@koa/bodyparser` or `koa-bodyparser` ran first: both keep the original
 *      text on `ctx.request.rawBody`, and that is what it verifies.
 *
 * A parser that consumes the stream and keeps no raw copy leaves nothing to
 * verify; it then answers 500 `raw_body_unavailable` and says why.
 */
import type { Context, Middleware, Next } from 'koa';
import { asRaw, BodyTooLargeError, DEFAULT_BODY_LIMIT, readAll } from './_shared/body.js';
import {
  DELIVERY_ID_HEADER,
  firstHeader,
  RAW_BODY_UNAVAILABLE,
  reject,
  SIGNATURE_HEADER,
  verifyRaw,
  type Rejection,
  type VerifyConfig,
} from './_shared/core.js';
import type { CrosslyEvent } from './_shared/events.js';

export * from './_shared/events.js';
export type { Rejection, RejectReason, VerifyConfig } from './_shared/core.js';

export interface CrosslyKoaOptions extends VerifyConfig {
  /** The endpoint's signing secret. Read per request when a function. */
  secret: string | undefined | ((ctx: Context) => string | undefined);
  /**
   * Only handle `POST` requests to this path; pass everything else to `next()`.
   * Leave unset when you mount the middleware on a router route yourself.
   */
  path?: string;
  /**
   * Handle the verified event. When it resolves and set no body, the middleware
   * answers `200 {"received":true}`. Throwing gives a 500, so Crossly retries.
   *
   * Omit it to use the middleware as a guard: it sets `ctx.state.crosslyEvent` and calls `next()`.
   */
  onEvent?: (event: CrosslyEvent, ctx: Context) => unknown | Promise<unknown>;
  /** Called with every rejection before it is sent; for logging. */
  onReject?: (rejection: Rejection, ctx: Context) => void;
  /** Maximum body size when this middleware reads the stream itself. Default 1 MiB. */
  limit?: number;
}

async function rawBodyOf(ctx: Context, limit: number): Promise<string | Uint8Array | undefined> {
  const kept = asRaw((ctx.request as unknown as { rawBody?: unknown }).rawBody);
  if (kept !== undefined) return kept;
  if (ctx.req.readableEnded) return undefined;
  return readAll(ctx.req, limit);
}

export function crosslyWebhook(options: CrosslyKoaOptions): Middleware {
  const limit = options.limit ?? DEFAULT_BODY_LIMIT;

  return async function crosslyWebhookMiddleware(ctx: Context, next: Next): Promise<void> {
    if (options.path !== undefined && (ctx.method !== 'POST' || ctx.path !== options.path)) {
      await next();
      return;
    }

    let raw: string | Uint8Array | undefined;
    try {
      raw = await rawBodyOf(ctx, limit);
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        ctx.status = 413;
        ctx.body = { error: { code: 'payload_too_large', message: err.message } };
        return;
      }
      throw err;
    }

    const fail = (rejection: Rejection) => {
      options.onReject?.(rejection, ctx);
      ctx.status = rejection.status;
      ctx.body = rejection.body;
    };

    if (raw === undefined) {
      fail(reject('raw_body_unavailable', RAW_BODY_UNAVAILABLE));
      return;
    }

    const secret = typeof options.secret === 'function' ? options.secret(ctx) : options.secret;
    const outcome = await verifyRaw(raw, firstHeader(ctx.headers[SIGNATURE_HEADER]), secret, options);
    if (!outcome.ok) {
      fail(outcome.rejection);
      return;
    }

    ctx.state.crosslyEvent = outcome.event;
    ctx.state.crosslyDeliveryId = firstHeader(ctx.headers[DELIVERY_ID_HEADER]);

    if (!options.onEvent) {
      await next();
      return;
    }
    await options.onEvent(outcome.event, ctx);
    if (ctx.body === undefined || ctx.body === null) {
      ctx.status = 200;
      ctx.body = { received: true };
    }
  };
}

export default crosslyWebhook;
