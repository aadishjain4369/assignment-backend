import { createHmac, timingSafeEqual } from 'crypto';

import {
  eventMeta,
  ingestKeyFrom,
  sourceFromBodyOrHeader,
} from '../lib/webhookParseUtils.js';
import { WebhookSubscription } from '../models/webhookSubscription.js';
import type { WebhookQueueJob } from '../types/webhookQueueJob.js';
import { validationError, type ServiceFail } from '../lib/utils.js';
import { incomingEventBodySchema } from '../validation/schemas.js';
import { publishWebhookJob } from './brokerService.js';

type Fail = ServiceFail;

const SIGNATURE_PREFIX = 'sha256=';

function computeInboundSignature(secret: string, rawBody: Buffer): string {
  const h = createHmac('sha256', secret).update(rawBody).digest('hex');
  return `${SIGNATURE_PREFIX}${h}`;
}

function verifyInboundSignature(
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
  const expected = computeInboundSignature(secret, rawBody).slice(SIGNATURE_PREFIX.length);

  const a = Buffer.from(receivedHex, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'Invalid signature' };
  }

  return { ok: true };
}

export type ProcessResult = { tags: string[]; note?: string };

const BILLING_TYPES = new Set([
  'order.paid',
  'invoice.finalized',
  'refund.processed',
  'subscription.updated',
]);

const RISK_TYPES = new Set(['payment.failed', 'api_key.rotated']);

const INVENTORY_TYPES = new Set(['inventory.low_stock', 'shipment.shipped']);

export function processEventByType(
  eventType: string,
  _payload: Record<string, unknown>
): ProcessResult {
  const tags: string[] = [`type:${eventType}`];

  if (BILLING_TYPES.has(eventType)) tags.push('domain:billing');
  if (RISK_TYPES.has(eventType)) tags.push('domain:risk');
  if (INVENTORY_TYPES.has(eventType)) tags.push('domain:inventory');

  return { tags, note: 'filtered' };
}

export async function handleIncomingEvent(
  body: unknown,
  headerSource: string | undefined,
  headerIngestKey: string | undefined,
  headerSignature: string | undefined,
  headerIdempotency: string | undefined,
  rawBody: Buffer | undefined,
  requestId?: string
): Promise<Fail | { ok: true; id: string; source: string; eventType: string }> {
  let parsedBody: Record<string, unknown>;
  try {
    parsedBody = incomingEventBodySchema.parse(body);
  } catch (e) {
    const fail = validationError(e);
    if (fail) return fail;
    throw e;
  }

  const idem = headerIdempotency?.trim();
  if (idem && !parsedBody.idempotencyKey) {
    parsedBody.idempotencyKey = idem;
  }

  const ingestKey = ingestKeyFrom(parsedBody, headerIngestKey);
  if (!ingestKey) {
    return {
      ok: false,
      status: 400,
      json: {
        error: 'ingestKey is required (JSON field ingestKey or X-Ingest-Key header)',
      },
    };
  }

  const subscribed = await WebhookSubscription.findOne({
    ingestKey,
    active: { $ne: false },
  }).select('+signingSecret');

  if (!subscribed) {
    return {
      ok: false,
      status: 403,
      json: {
        error:
          'Unknown ingest key or subscription is inactive. Subscribe in the dashboard to get a key.',
      },
    };
  }

  if (subscribed.signingEnabled && subscribed.signingSecret) {
    if (!rawBody) {
      return {
        ok: false,
        status: 400,
        json: {
          error:
            'Raw body required for signature verification (enable JSON verify on server)',
        },
      };
    }
    const sig = verifyInboundSignature(
      subscribed.signingSecret,
      rawBody,
      headerSignature
    );
    if (!sig.ok) {
      return { ok: false, status: 401, json: { error: sig.reason } };
    }
  }

  const { eventType } = eventMeta(parsedBody);
  const eventSource = sourceFromBodyOrHeader(parsedBody, headerSource);

  const job: WebhookQueueJob = {
    subscriptionId: subscribed._id.toString(),
    userId: subscribed.userId.toString(),
    ingestKey,
    parsedBody,
    receivedAt: new Date().toISOString(),
    requestId,
  };

  const id = await publishWebhookJob(job);

  return {
    ok: true,
    id,
    source: eventSource || subscribed.source,
    eventType,
  };
}
