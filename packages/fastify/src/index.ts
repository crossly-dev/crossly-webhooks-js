/**
 * @crossly/fastify — a Crossly webhook receiver for Fastify 4 and 5.
 *
 *   await app.register(crosslyWebhook, {
 *     path: '/webhooks/crossly',
 *     secret: process.env.CROSSLY_WEBHOOK_SECRET,
 *     onEvent: async (event) => { ... },
 *   });
 *
 * Fastify parses `application/json` before your handler runs, and the parsed
 * object cannot be turned back into the bytes Crossly signed. This plugin
 * registers its route inside its OWN encapsulated context and replaces the
 * content-type parsers there with one that keeps the body as a Buffer. The rest
 * of your app keeps its normal JSON parsing; nothing global changes.
 *
 * Do not wrap it in `fastify-plugin`: that removes the encapsulation, and the raw
 * parser would then apply to every route in the app.
 */
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { DELIVERY_ID_HEADER, firstHeader, SIGNATURE_HEADER, verifyRaw, type Rejection, type VerifyConfig } from './_shared/core.js';
import type { CrosslyEvent } from './_shared/events.js';

export * from './_shared/events.js';
export type { Rejection, RejectReason, VerifyConfig } from './_shared/core.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** The verified event, on requests to the Crossly webhook route. */
    crosslyEvent?: CrosslyEvent;
  }
}

export interface CrosslyFastifyOptions extends VerifyConfig {
  /** The endpoint's signing secret. Read per request when a function. */
  secret: string | undefined | ((request: FastifyRequest) => string | undefined);
  /**
   * Handle the verified event. When it resolves and the reply was not sent, the
   * route answers `200 {"received":true}`. Throwing gives a 500, so Crossly retries.
   */
  onEvent: (event: CrosslyEvent, request: FastifyRequest, reply: FastifyReply) => unknown | Promise<unknown>;
  /** Route path. Default `/webhooks/crossly`. Combine with `register(..., { prefix })` as usual. */
  path?: string;
  /** Called with every rejection before it is sent; for logging. */
  onReject?: (rejection: Rejection, request: FastifyRequest) => void;
  /** Body size limit in bytes for this route. Default 1 MiB. */
  bodyLimit?: number;
}

export const crosslyWebhook: FastifyPluginAsync<CrosslyFastifyOptions> = async (instance, options) => {
  // Encapsulated: these parsers exist only inside this plugin's context.
  instance.removeAllContentTypeParsers();
  instance.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  instance.post(
    options.path ?? '/webhooks/crossly',
    { bodyLimit: options.bodyLimit ?? 1024 * 1024 },
    async (request, reply) => {
      const raw = Buffer.isBuffer(request.body) ? request.body : typeof request.body === 'string' ? request.body : Buffer.alloc(0);
      const secret = typeof options.secret === 'function' ? options.secret(request) : options.secret;
      const outcome = await verifyRaw(raw, firstHeader(request.headers[SIGNATURE_HEADER]), secret, options);
      if (!outcome.ok) {
        options.onReject?.(outcome.rejection, request);
        return reply.code(outcome.rejection.status).send(outcome.rejection.body);
      }
      request.crosslyEvent = outcome.event;
      request.log.debug(
        { crosslyEvent: outcome.event.type, eventId: outcome.event.id, deliveryId: firstHeader(request.headers[DELIVERY_ID_HEADER]) },
        'crossly webhook verified',
      );
      await options.onEvent(outcome.event, request, reply);
      if (!reply.sent) return reply.code(200).send({ received: true });
      return reply;
    },
  );
};

export default crosslyWebhook;
