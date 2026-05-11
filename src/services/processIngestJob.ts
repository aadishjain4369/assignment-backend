import mongoose from 'mongoose';

import { isMongoDuplicateKey } from '../lib/utils.js';
import { logInfo, logWarn } from '../lib/log.js';
import { eventMeta, sourceFromBodyOrHeader } from '../lib/webhookParseUtils.js';
import { WebhookEvent } from '../models/webhookEvent.js';
import { WebhookSubscription } from '../models/webhookSubscription.js';
import { broadcastFeedEvent } from '../realtime/feedHub.js';
import type { WebhookQueueJob } from '../types/webhookQueueJob.js';
import { queueOutboundIfNeeded } from './deliveryService.js';
import { processEventByType } from './webhookProcessor.js';

type LeanEvent = {
  _id: mongoose.Types.ObjectId;
  source: string;
  eventType: string;
  externalId?: string | null;
  idempotencyKey?: string | null;
  payload: unknown;
  processingTags?: string[];
  createdAt?: Date;
};

function ssePayload(doc: LeanEvent) {
  return {
    _id: String(doc._id),
    source: doc.source,
    eventType: doc.eventType,
    externalId: doc.externalId ?? undefined,
    idempotencyKey: doc.idempotencyKey ?? undefined,
    payload: doc.payload,
    processingTags: doc.processingTags,
    createdAt: doc.createdAt,
  };
}

async function findExistingDedup(
  userId: mongoose.Types.ObjectId,
  source: string,
  externalId?: string,
  idempotencyKey?: string
): Promise<LeanEvent | null> {
  if (idempotencyKey) {
    const byKey = await WebhookEvent.findOne({ userId, idempotencyKey }).lean();
    if (byKey) return byKey as LeanEvent;
  }
  if (externalId) {
    const byExt = await WebhookEvent.findOne({
      userId,
      source,
      externalId,
    }).lean();
    if (byExt) return byExt as LeanEvent;
  }
  return null;
}

export async function processQueuedWebhook(job: WebhookQueueJob): Promise<string> {
  const rid = job.requestId;
  const sub = await WebhookSubscription.findById(job.subscriptionId);
  if (!sub || sub.active === false) {
    logWarn('ingest skipped — inactive or missing subscription', {
      requestId: rid,
      subscriptionId: job.subscriptionId,
    });
    return '';
  }

  const body = job.parsedBody;
  const eventSource = sourceFromBodyOrHeader(body, undefined) || sub.source;
  const { eventType, externalId, idempotencyKey } = eventMeta(body);
  const processed = processEventByType(eventType, body);
  const userOid = new mongoose.Types.ObjectId(job.userId);

  const existing = await findExistingDedup(
    userOid,
    eventSource,
    externalId,
    idempotencyKey
  );
  if (existing) {
    broadcastFeedEvent(job.userId, ssePayload(existing));
    logInfo('ingest deduplicated', {
      requestId: rid,
      eventId: String(existing._id),
      userId: job.userId,
      source: eventSource,
    });
    return String(existing._id);
  }

  try {
    const doc = await WebhookEvent.create({
      userId: userOid,
      source: eventSource,
      eventType,
      externalId,
      idempotencyKey,
      payload: body,
      processingTags: processed.tags,
    });

    broadcastFeedEvent(job.userId, ssePayload(doc.toObject() as LeanEvent));
    logInfo('ingest stored', {
      requestId: rid,
      eventId: doc._id.toString(),
      userId: job.userId,
      source: eventSource,
      eventType,
    });

    void queueOutboundIfNeeded(sub, doc._id).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      logWarn('outbound queue error', { eventId: doc._id.toString(), err: msg });
    });

    return doc._id.toString();
  } catch (err) {
    if (!isMongoDuplicateKey(err)) throw err;

    const again = await findExistingDedup(
      userOid,
      eventSource,
      externalId,
      idempotencyKey
    );
    if (again) {
      broadcastFeedEvent(job.userId, ssePayload(again));
      logInfo('ingest deduplicated after race', {
        requestId: rid,
        eventId: String(again._id),
      });
      return String(again._id);
    }
    throw err;
  }
}
