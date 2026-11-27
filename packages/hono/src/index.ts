/**
 * @crossly/hono — a Crossly webhook receiver for Hono, on any runtime Hono runs
 * on (Cloudflare Workers, Bun, Deno, Node, Vercel, Lambda).
 *
 *   app.post('/webhooks/crossly', crosslyWebhook({
 *     secret: (c) => c.env.CROSSLY_WEBHOOK_SECRET,
 *     onEvent: async (event, c) => { ... },
 *   }));
 *
 * Hono does not parse bodies on its own, so the raw bytes are always available:
 * this reads them with `c.req.arrayBuffer()`. Hono caches the body, so a later
 * `c.req.json()` in your own code still works.
 *
 * On Workers the secret lives in `c.env`, which only exists per request: pass a
 * function, not `process.env`.
 */
import type { Context, Env, MiddlewareHandler } from 'hono';
import { DELIVERY_ID_HEADER, SIGNATURE_HEADER, verifyRaw, type Rejection, type VerifyConfig } from './_shared/core.js';
import type { CrosslyEvent } from './_shared/events.js';

export * from './_shared/events.js';
export type { Rejection, RejectReason, VerifyConfig } from './_shared/core.js';

/** The context variables this middleware sets: `c.get('crosslyEvent')`. */
export interface CrosslyVariables {
  crosslyEvent: CrosslyEvent;
  crosslyDeliveryId: string | undefined;
}

export interface CrosslyHonoOptions<E extends Env = Env> extends VerifyConfig {
  /** The endpoint's signing secret, or a function of the context (`(c) => c.env.CROSSLY_WEBHOOK_SECRET`). */
  secret: string | undefined | ((c: Context<E>) => string | undefined);
  /**
   * Handle the verified event. Return a Response to answer with it; otherwise the
   * middleware answers `200 {"received":true}`. Throwing gives a 500 (Crossly retries).
   *
   * Omit it to use the middleware as a guard: it sets `c.get('crosslyEvent')` and calls `next()`.
   */
  onEvent?: (event: CrosslyEvent, c: Context<E>) => Response | void | Promise<Response | void>;
  /** Called with every rejection before it is sent; for logging. */
  onReject?: (rejection: Rejection, c: Context<E>) => void;
}

export function crosslyWebhook<E extends Env = Env>(
  options: CrosslyHonoOptions<E>,
): MiddlewareHandler<E & { Variables: CrosslyVariables }> {
  return async (c, next) => {
    const ctx = c as unknown as Context<E>;
    const raw = new Uint8Array(await c.req.arrayBuffer());
    const secret = typeof options.secret === 'function' ? options.secret(ctx) : options.secret;
    const outcome = await verifyRaw(raw, c.req.header(SIGNATURE_HEADER), secret, options);
    if (!outcome.ok) {
      options.onReject?.(outcome.rejection, ctx);
      return c.json(outcome.rejection.body, outcome.rejection.status);
    }
    c.set('crosslyEvent', outcome.event);
    c.set('crosslyDeliveryId', c.req.header(DELIVERY_ID_HEADER));
    if (!options.onEvent) {
      await next();
      return;
    }
    const result = await options.onEvent(outcome.event, ctx);
    if (result instanceof Response) return result;
    return c.json({ received: true }, 200);
  };
}

export default crosslyWebhook;
