/**
 * @crossly/next — a Crossly webhook receiver as a Next.js App Router route handler.
 *
 *   // app/api/webhooks/crossly/route.ts
 *   import { crosslyWebhookHandler } from '@crossly/next';
 *
 *   export const POST = crosslyWebhookHandler({
 *     secret: () => process.env.CROSSLY_WEBHOOK_SECRET,
 *     onEvent: async (event) => { ... },
 *   });
 *
 * Route handlers get the standard Web `Request` with an unread body, so the raw
 * bytes are always there: this reads `request.arrayBuffer()`. It never touches
 * `request.json()`, which would consume the body first.
 *
 * Works on the Node.js and Edge runtimes (verification uses Web Crypto). It has no
 * import from `next` at all, so it also works in any other framework whose
 * handlers are `(Request) => Response` (Remix/React Router actions, SvelteKit,
 * Astro endpoints, Bun.serve, Deno.serve).
 */
import { DELIVERY_ID_HEADER, SIGNATURE_HEADER, verifyRaw, type Rejection, type VerifyConfig } from './_shared/core.js';
import type { CrosslyEvent } from './_shared/events.js';

export * from './_shared/events.js';
export type { Rejection, RejectReason, VerifyConfig } from './_shared/core.js';

export interface CrosslyRequestContext {
  request: Request;
  /** `Crossly-Delivery-Id`: unique per delivery attempt. Log it; dedupe on `event.id`. */
  deliveryId: string | undefined;
}

export interface CrosslyNextOptions extends VerifyConfig {
  /**
   * The endpoint's signing secret. Prefer a function (`() => process.env.X`): it is
   * read per request, so a missing variable during `next build` does not fail the
   * build, and a missing one at runtime is a clear 500 rather than a crash.
   */
  secret: string | undefined | (() => string | undefined);
  /**
   * Handle the verified event. Return a Response to answer with it; otherwise the
   * handler answers `200 {"received":true}`. Throwing gives a 500 (Crossly retries).
   */
  onEvent: (event: CrosslyEvent, ctx: CrosslyRequestContext) => Response | void | Promise<Response | void>;
  /** Called with every rejection before it is sent; for logging. */
  onReject?: (rejection: Rejection, request: Request) => void;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Build a `POST` route handler. */
export function crosslyWebhookHandler(options: CrosslyNextOptions): (request: Request) => Promise<Response> {
  return async function POST(request: Request): Promise<Response> {
    const raw = new Uint8Array(await request.arrayBuffer());
    const secret = typeof options.secret === 'function' ? options.secret() : options.secret;
    const outcome = await verifyRaw(raw, request.headers.get(SIGNATURE_HEADER), secret, options);
    if (!outcome.ok) {
      options.onReject?.(outcome.rejection, request);
      return json(outcome.rejection.body, outcome.rejection.status);
    }
    const result = await options.onEvent(outcome.event, {
      request,
      deliveryId: request.headers.get(DELIVERY_ID_HEADER) ?? undefined,
    });
    return result instanceof Response ? result : json({ received: true }, 200);
  };
}

/** Verify a `Request` yourself, for handlers that do more than receive webhooks. Throws nothing; inspect `ok`. */
export async function verifyCrosslyRequest(
  request: Request,
  secret: string | undefined,
  config: VerifyConfig = {},
): ReturnType<typeof verifyRaw> {
  const raw = new Uint8Array(await request.arrayBuffer());
  return verifyRaw(raw, request.headers.get(SIGNATURE_HEADER), secret, config);
}

export default crosslyWebhookHandler;
