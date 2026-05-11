import { createHmac, timingSafeEqual } from 'crypto';

export const SIGNATURE_HEADER = 'x-webhook-signature';
export const SIGNATURE_PREFIX = 'sha256=';

export function computeSignature(secret: string, rawBody: Buffer): string {
  const h = createHmac('sha256', secret).update(rawBody).digest('hex');
  return `${SIGNATURE_PREFIX}${h}`;
}

export function verifyWebhookSignature(
  secret: string,
  rawBody: Buffer,
  headerValue: string | undefined
): { ok: true } | { ok: false; reason: string } {
  if (!headerValue || typeof headerValue !== 'string') {
    return { ok: false, reason: 'Missing X-Webhook-Signature header' };
  }

  const trimmed = headerValue.trim();
  if (!trimmed.startsWith(SIGNATURE_PREFIX)) {
    return {
      ok: false,
      reason: `Signature must start with ${SIGNATURE_PREFIX}`,
    };
  }

  const receivedHex = trimmed.slice(SIGNATURE_PREFIX.length);
  const expected = computeSignature(secret, rawBody).slice(SIGNATURE_PREFIX.length);

  const a = Buffer.from(receivedHex, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'Invalid signature' };
  }

  return { ok: true };
}
