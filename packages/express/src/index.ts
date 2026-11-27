/**
 * @crossly/express — a Crossly webhook receiver for Express 4 and 5.
 *
 *   app.post('/webhooks/crossly', crosslyWebhook({
 *     secret: process.env.CROSSLY_WEBHOOK_SECRET,
 *     onEvent: async (event) => { if (event.type === 'sale.detected') ... },
 *   }));
 *
 * The signature covers the exact bytes Crossly sent. This middleware gets them in
 * whichever of these is true, in order:
 *
 *   1. `express.raw()` ran on the route, so `req.body` is a Buffer.
 *   2. A JSON parser ran but kept the bytes with `verify: keepRawBody`, so
 *      `req.rawBody` is a Buffer.
 *   3. No body parser ran at all, so the stream is still unread: it reads it.
 *
 * If a JSON parser consumed the stream without keeping the bytes, the bytes are
 * gone. It answers 500 `raw_body_unavailable` and says so, rather than verifying
 * `JSON.stringify(req.body)`, which does not round-trip and fails on genuine events.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
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

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The verified event, set by `crosslyWebhook()`. */
      crosslyEvent?: CrosslyEvent;
      /** The raw body, when a JSON parser kept it with `verify: keepRawBody`. */
      rawBody?: Buffer;
    }
  }
}

export interface CrosslyExpressOptions extends VerifyConfig {
  /** The endpoint's signing secret (Settings → API & webhooks → Webhooks). Read per request when a function. */
  secret: string | undefined | ((req: Request) => string | undefined);
  /**
   * Handle the verified event. When it resolves without sending a response, the
   * middleware answers `200 {"received":true}`. Throwing passes the error to
   * Express's error handler (a 500), so Crossly retries the delivery.
   *
   * Omit it to use the middleware as a guard: it sets `req.crosslyEvent` and calls `next()`.
   */
  onEvent?: (event: CrosslyEvent, req: Request, res: Response) => unknown | Promise<unknown>;
  /** Called with every rejection before it is sent; for logging. */
  onReject?: (rejection: Rejection, req: Request) => void;
  /** Maximum body size when this middleware reads the stream itself. Default 1 MiB. */
  limit?: number;
}

/**
 * Pass as `verify` to `express.json()` when a JSON parser has to run first (for
 * example `app.use(express.json())` above every route):
 *
 *   app.use(express.json({ verify: keepRawBody }));
 */
export function keepRawBody(req: Request, _res: Response, buf: Buffer): void {
  req.rawBody = buf;
}

/** Was the stream consumed by a body parser? body-parser sets `_body`; an ended stream cannot be read again. */
function streamConsumed(req: Request): boolean {
  return Boolean((req as unknown as { _body?: boolean })._body) || req.readableEnded;
}

async function rawBodyOf(req: Request, limit: number): Promise<string | Uint8Array | undefined> {
  const fromBody = asRaw(req.body);
  if (fromBody !== undefined) return fromBody;
  if (req.rawBody instanceof Uint8Array) return req.rawBody;
  if (streamConsumed(req)) return undefined;
  return readAll(req, limit);
}

function send(res: Response, rejection: Rejection): void {
  res.status(rejection.status).json(rejection.body);
}

export function crosslyWebhook(options: CrosslyExpressOptions): RequestHandler {
  const limit = options.limit ?? DEFAULT_BODY_LIMIT;

  return function crosslyWebhookMiddleware(req: Request, res: Response, next: NextFunction): void {
    void (async () => {
      let raw: string | Uint8Array | undefined;
      try {
        raw = await rawBodyOf(req, limit);
      } catch (err) {
        if (err instanceof BodyTooLargeError) {
          res.status(413).json({ error: { code: 'payload_too_large', message: err.message } });
          return;
        }
        throw err;
      }

      if (raw === undefined) {
        const rejection = reject('raw_body_unavailable', RAW_BODY_UNAVAILABLE);
        options.onReject?.(rejection, req);
        send(res, rejection);
        return;
      }

      const secret = typeof options.secret === 'function' ? options.secret(req) : options.secret;
      const outcome = await verifyRaw(raw, firstHeader(req.headers[SIGNATURE_HEADER]), secret, options);
      if (!outcome.ok) {
        options.onReject?.(outcome.rejection, req);
        send(res, outcome.rejection);
        return;
      }

      req.crosslyEvent = outcome.event;
      res.locals.crosslyEvent = outcome.event;
      res.locals.crosslyDeliveryId = firstHeader(req.headers[DELIVERY_ID_HEADER]);

      if (!options.onEvent) {
        next();
        return;
      }
      await options.onEvent(outcome.event, req, res);
      if (!res.headersSent) res.status(200).json({ received: true });
    })().catch(next);
  };
}

export default crosslyWebhook;
