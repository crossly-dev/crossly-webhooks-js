/**
 * Reading a request body that nothing has consumed yet.
 */

/** Crossly payloads are small; anything far past this is not a Crossly delivery. */
export const DEFAULT_BODY_LIMIT = 1024 * 1024;

export class BodyTooLargeError extends Error {
  constructor(limit: number) {
    super(`Request body is larger than ${limit} bytes.`);
    this.name = 'BodyTooLargeError';
  }
}

/** Collect an unread stream (a Node IncomingMessage is one) into bytes, without decoding. */
export async function readAll(
  stream: AsyncIterable<Uint8Array | string>,
  limit: number = DEFAULT_BODY_LIMIT,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const encoder = new TextEncoder();
  for await (const chunk of stream) {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
    size += bytes.byteLength;
    if (size > limit) throw new BodyTooLargeError(limit);
    chunks.push(bytes);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** A body a parser left behind as raw bytes or text, if it is one. */
export function asRaw(value: unknown): string | Uint8Array | undefined {
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) return value; // Node Buffers are Uint8Arrays
  return undefined;
}
