import { randomBytes, randomUUID } from 'crypto';

import mongoose from 'mongoose';

import { parseObjectId, validationError, type ServiceFail } from '../lib/utils.js';
import { WebhookEvent } from '../models/webhookEvent.js';
import { WebhookSubscription } from '../models/webhookSubscription.js';
import { signingActionSchema, subscribeBodySchema } from '../validation/schemas.js';

type Fail = ServiceFail;

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
