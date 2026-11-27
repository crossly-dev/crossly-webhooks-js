/**
 * The shared Crossly webhook conformance vectors (test-vectors.json, the same file
 * every Crossly SDK verifier is checked against), plus helpers for adapter tests.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface Vector {
  name: string;
  body: string;
  header: string;
  secret: string;
  now: number;
  toleranceSeconds?: number;
  expect: 'ok' | 'bad_signature' | 'timestamp_out_of_tolerance' | 'malformed_header';
}

const file = JSON.parse(readFileSync(new URL('../test-vectors.json', import.meta.url), 'utf8')) as {
  toleranceSeconds: number;
  vectors: Vector[];
};

export const vectors: Vector[] = file.vectors;
export const defaultTolerance = file.toleranceSeconds;
export const rejected = vectors.filter((v) => v.expect !== 'ok');
export const accepted = vectors.filter((v) => v.expect === 'ok');

export const SECRET = 'whsec_adapter_test_secret';

/** Sign a body the way Crossly does, for tests beyond the vectors. */
export function sign(body: string, secret = SECRET, t = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

export const sampleBody = JSON.stringify({
  id: 'evt_adapter_test',
  type: 'sale.detected',
  created: '2026-11-27T12:00:00.000Z',
  data: { saleId: 'sale_1', orderId: 'ord_1', inventoryItemId: null, platform: 'ebay', platformOrderId: null, salePrice: 84, platformFee: 16.8 },
});

/** Headers for a vector. An empty header value is sent as no header at all, which every adapter must reject. */
export function vectorHeaders(v: Vector): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (v.header !== '') h['crossly-signature'] = v.header;
  return h;
}
