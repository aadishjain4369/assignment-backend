import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';

import mongoose from 'mongoose';

import { parseObjectId, validationError, type ServiceFail } from '../lib/utils.js';
import {
  eventMeta,
  ingestKeyFrom,
  sourceFromBodyOrHeader,
} from '../lib/webhookParseUtils.js';
import { WebhookEvent } from '../models/webhookEvent.js';
import { WebhookSubscription } from '../models/webhookSubscription.js';
import type { WebhookQueueJob } from '../types/webhookQueueJob.js';
import {
  incomingEventBodySchema,
  signingActionSchema,
  subscribeBodySchema,
} from '../validation/schemas.js';
import { publishWebhookJob } from './brokerService.js';

type Fail = ServiceFail;

// ─── Inbound HMAC (raw body) ───────────────────────────────────────────────

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

// ─── Event-type tagging (demo classifier for stored events) ────────────────

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

// ─── Subscriptions & ingest ────────────────────────────────────────────────

export async function subscribe(
  body: unknown,
  userId: string
): Promise<{ ok: true; subscription: unknown; signingSecret?: string } | Fail> {
  const uid = parseObjectId(userId);
  if (!uid) {
    return { ok: false, status: 401, json: { error: 'Invalid session' } };
  }

  try {
    const parsed = subscribeBodySchema.parse(body);
    const update: Record<string, unknown> = {
      active: true,
      cancelledAt: null,
    };
    if (parsed.callbackUrl !== undefined) {
      update.callbackUrl = parsed.callbackUrl;
    }

    let revealedSecret: string | undefined;
    if (parsed.enableSigning === true) {
      revealedSecret = randomBytes(32).toString('hex');
      update.signingSecret = revealedSecret;
      update.signingEnabled = true;
    }

    const subscription = await WebhookSubscription.findOneAndUpdate(
      { userId: uid, source: parsed.source },
      {
        $set: update,
        $setOnInsert: {
          userId: uid,
          source: parsed.source,
          ingestKey: randomUUID(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const doc = subscription?.toObject?.() ?? subscription;
    if (doc && typeof doc === 'object' && 'signingSecret' in doc) {
      delete (doc as { signingSecret?: string }).signingSecret;
    }

    return {
      ok: true,
      subscription: doc,
      ...(revealedSecret ? { signingSecret: revealedSecret } : {}),
    };
  } catch (e) {
    const fail = validationError(e);
    if (fail) return fail;
    throw e;
  }
}

export async function updateSigning(
  body: unknown,
  userId: string,
  sourceRaw: string
): Promise<{ ok: true; subscription: unknown; signingSecret?: string } | Fail> {
  const uid = parseObjectId(userId);
  if (!uid) {
    return { ok: false, status: 401, json: { error: 'Invalid session' } };
  }

  const source = sourceRaw.trim();
  if (!source) {
    return { ok: false, status: 400, json: { error: 'source is required' } };
  }

  try {
    const { action } = signingActionSchema.parse(body);

    if (action === 'disable') {
      const subscription = await WebhookSubscription.findOneAndUpdate(
        { userId: uid, source },
        { $set: { signingEnabled: false }, $unset: { signingSecret: 1 } },
        { new: true }
      );
      if (!subscription) {
        return {
          ok: false,
          status: 404,
          json: { error: 'Subscription not found', source },
        };
      }
      return { ok: true, subscription };
    }

    const newSecret = randomBytes(32).toString('hex');
    const subscription = await WebhookSubscription.findOneAndUpdate(
      { userId: uid, source },
      {
        $set: { signingSecret: newSecret, signingEnabled: true },
      },
      { new: true }
    );

    if (!subscription) {
      return {
        ok: false,
        status: 404,
        json: { error: 'Subscription not found', source },
      };
    }

    const lean = subscription.toObject();
    delete (lean as { signingSecret?: string }).signingSecret;

    return {
      ok: true,
      subscription: lean,
      signingSecret: newSecret,
    };
  } catch (e) {
    const fail = validationError(e);
    if (fail) return fail;
    throw e;
  }
}

export async function list(userId: string) {
  const uid = parseObjectId(userId);
  if (!uid) return [];
  return WebhookSubscription.find({ userId: uid }).sort({ createdAt: -1 }).lean();
}

export async function cancel(
  sourceRaw: string,
  userId: string
): Promise<{ ok: true; subscription: unknown } | Fail> {
  const uid = parseObjectId(userId);
  if (!uid) {
    return { ok: false, status: 401, json: { error: 'Invalid session' } };
  }

  const source = sourceRaw.trim();
  if (!source) {
    return { ok: false, status: 400, json: { error: 'source is required' } };
  }

  const subscription = await WebhookSubscription.findOneAndUpdate(
    { userId: uid, source },
    { $set: { active: false, cancelledAt: new Date() } },
    { new: true }
  );

  if (!subscription) {
    return {
      ok: false,
      status: 404,
      json: { error: 'Subscription not found', source },
    };
  }

  return { ok: true, subscription };
}

export async function feed(
  userId: string,
  query: {
    limitRaw: number;
    eventType?: string;
    source?: string;
    before?: string;
  }
): Promise<Fail | { ok: true; items: unknown[] }> {
  const uid = parseObjectId(userId);
  if (!uid) {
    return { ok: false, status: 401, json: { error: 'Invalid session' } };
  }

  const limit = Math.min(Math.max(Number(query.limitRaw) || 50, 1), 100);
  const filter: Record<string, unknown> = { userId: uid };

  if (query.eventType?.trim()) {
    filter.eventType = query.eventType.trim();
  }
  if (query.source?.trim()) {
    filter.source = query.source.trim();
  }
  if (query.before && mongoose.Types.ObjectId.isValid(query.before)) {
    filter._id = { $lt: new mongoose.Types.ObjectId(query.before) };
  }

  const items = await WebhookEvent.find(filter).sort({ _id: -1 }).limit(limit).lean();

  return { ok: true, items };
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
