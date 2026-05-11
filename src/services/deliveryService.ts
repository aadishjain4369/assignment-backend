import mongoose from 'mongoose';

import { logInfo } from '../lib/log.js';
import { WebhookDelivery } from '../models/webhookDelivery.js';
import { WebhookEvent } from '../models/webhookEvent.js';

const RETRY_DELAYS_MS = [30_000, 120_000, 300_000, 900_000, 3_600_000];

function delayAfterFailedAttempt(attemptsAfterIncrement: number): number {
  const idx = Math.min(
    Math.max(attemptsAfterIncrement - 1, 0),
    RETRY_DELAYS_MS.length - 1
  );
  return RETRY_DELAYS_MS[idx];
}

export async function queueOutboundIfNeeded(
  subscription: {
    _id: mongoose.Types.ObjectId;
    callbackUrl?: string | null | undefined;
  },
  eventId: mongoose.Types.ObjectId
): Promise<void> {
  const targetUrl = subscription.callbackUrl?.trim();
  if (!targetUrl) return;

  const delivery = await WebhookDelivery.create({
    subscriptionId: subscription._id,
    eventId,
    targetUrl,
    status: 'pending',
    attempts: 0,
    maxAttempts: 5,
    nextRetryAt: new Date(),
  });

  void runDeliveryAttempt(delivery._id).catch((e) => console.error('[delivery]', e));
}

export async function runDeliveryAttempt(
  deliveryId: mongoose.Types.ObjectId
): Promise<void> {
  const delivery = await WebhookDelivery.findById(deliveryId);
  if (!delivery || delivery.status === 'delivered') return;

  const event = await WebhookEvent.findById(delivery.eventId).lean();
  if (!event) {
    delivery.status = 'failed';
    delivery.lastError = 'Referenced webhook event was not found';
    await delivery.save();
    return;
  }

  delivery.attempts += 1;
  delivery.lastAttemptAt = new Date();

  const envelope = {
    webhookEventId: String(event._id),
    source: event.source,
    type: event.eventType,
    externalId: event.externalId,
    receivedAt: event.createdAt,
    payload: event.payload,
  };

  try {
    const res = await fetch(delivery.targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    });

    if (res.ok) {
      delivery.status = 'delivered';
      delivery.lastError = undefined;
      await delivery.save();
      logInfo('delivery succeeded', {
        deliveryId: delivery._id.toString(),
        eventId: delivery.eventId.toString(),
        targetUrl: delivery.targetUrl,
        attempts: delivery.attempts,
      });
      return;
    }

    const text = await res.text().catch(() => '');
    delivery.lastError = `HTTP ${res.status}: ${text.slice(0, 500)}`;
    logInfo('delivery http failure', {
      deliveryId: delivery._id.toString(),
      eventId: delivery.eventId.toString(),
      status: res.status,
      attempts: delivery.attempts,
    });
  } catch (e) {
    delivery.lastError = e instanceof Error ? e.message : String(e);
    logInfo('delivery network error', {
      deliveryId: delivery._id.toString(),
      eventId: delivery.eventId.toString(),
      attempts: delivery.attempts,
      err: delivery.lastError,
    });
  }

  if (delivery.attempts >= delivery.maxAttempts) {
    delivery.status = 'failed';
  } else {
    delivery.status = 'pending';
    delivery.nextRetryAt = new Date(
      Date.now() + delayAfterFailedAttempt(delivery.attempts)
    );
  }

  await delivery.save();
}

export async function processDueDeliveries(): Promise<void> {
  const now = new Date();
  const due = await WebhookDelivery.find({
    status: 'pending',
    nextRetryAt: { $lte: now },
    $expr: { $lt: ['$attempts', '$maxAttempts'] },
  })
    .limit(25)
    .select('_id');

  for (const d of due) {
    void runDeliveryAttempt(d._id).catch((e) => console.error('[delivery retry]', e));
  }
}
