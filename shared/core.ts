/**
 * The framework-independent half of every adapter: verify the raw bytes with
 * `@crossly/sdk`'s `verifyWebhook`, and turn the outcome into an HTTP answer.
 */
import { verifyWebhook, WebhookVerificationError } from '@crossly/sdk';
import type { CrosslyEvent } from './events.js';

export const SIGNATURE_HEADER = 'crossly-signature';
export const EVENT_HEADER = 'crossly-event';
export const DELIVERY_ID_HEADER = 'crossly-delivery-id';

export interface VerifyConfig {
  /**
   * How far the signed timestamp may be from now, in seconds. Default 300, the
   * same window Crossly documents. Tighter rejects genuine retried deliveries.
   */
  toleranceSeconds?: number;
  /** Clock override in unix seconds. For tests; leave unset in production. */
  now?: () => number;
}

export type RejectReason =
  | 'malformed_header'
  | 'bad_signature'
  | 'timestamp_out_of_tolerance'
  | 'invalid_payload'
  | 'missing_secret'
  | 'no_crypto'
  | 'raw_body_unavailable';

export interface Rejection {
  /** 400 for anything the sender got wrong, 500 for a misconfigured receiver. */
  status: 400 | 500;
  body: { error: { code: RejectReason; message: string } };
}

export type VerifyOutcome =
  | { ok: true; event: CrosslyEvent }
  | { ok: false; rejection: Rejection };

/** Problems on OUR side of the wire. Answering 400 would tell Crossly to stop retrying a delivery we could take later. */
const SERVER_SIDE: ReadonlySet<RejectReason> = new Set(['missing_secret', 'no_crypto', 'raw_body_unavailable']);

export function reject(code: RejectReason, message: string): Rejection {
  return { status: SERVER_SIDE.has(code) ? 500 : 400, body: { error: { code, message } } };
}

export const RAW_BODY_UNAVAILABLE =
  'The request body was already parsed as JSON before the Crossly webhook handler ran, so the exact ' +
  'signed bytes are gone. Mount the webhook route before your JSON body parser, or keep the raw bytes ' +
  '(see the README section "Body parsers").';

export async function verifyRaw(
  rawBody: string | Uint8Array,
  signatureHeader: string | null | undefined,
  secret: string | undefined,
  config: VerifyConfig = {},
): Promise<VerifyOutcome> {
  if (!secret) {
    return {
      ok: false,
      rejection: reject('missing_secret', 'No webhook signing secret is configured on this receiver.'),
    };
  }
  try {
    const event = await verifyWebhook<unknown>(rawBody, signatureHeader ?? null, secret, {
      toleranceSeconds: config.toleranceSeconds,
      nowSeconds: config.now?.(),
    });
    if (!event || typeof event !== 'object' || typeof (event as { type?: unknown }).type !== 'string') {
      return { ok: false, rejection: reject('invalid_payload', 'The signed body is not a Crossly event envelope.') };
    }
    return { ok: true, event: event as unknown as CrosslyEvent };
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return { ok: false, rejection: reject(err.reason, err.message) };
    }
    if (err instanceof SyntaxError) {
      return { ok: false, rejection: reject('invalid_payload', 'The signed body is not valid JSON.') };
    }
    throw err;
  }
}

/** Header values can arrive as arrays from Node's http module; take the first. */
export function firstHeader(value: string | string[] | null | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}
