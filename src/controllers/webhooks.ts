import type { Request, Response } from 'express';

import { asyncHandler, headerValue } from '../lib/utils.js';
import { subscribeFeed } from '../realtime/feedHub.js';
import * as webhooks from '../services/webhooks.service.js';

function subscriptionJson(
  subscription: unknown,
  signingSecret?: string
): Record<string, unknown> {
  const base =
    subscription && typeof subscription === 'object' && !Array.isArray(subscription)
      ? { ...(subscription as Record<string, unknown>) }
      : {};
  if (signingSecret) {
    base.signingSecret = signingSecret;
    base.signingSecretNote =
      'Save this secret now; it is not shown again. Send X-Webhook-Signature: sha256=<hex> (HMAC-SHA256 of the raw JSON body).';
  }
  return base;
}

function userId(req: Request, res: Response): string | undefined {
  const id = req.auth?.sub;
  if (!id) {
    res.status(401).json({ error: 'Unauthorized' });
    return undefined;
  }
  return id;
}

export const subscribe = asyncHandler(async (req, res) => {
  const uid = userId(req, res);
  if (!uid) return;

  const out = await webhooks.subscribe(req.body, uid);
  if (!out.ok) {
    res.status(out.status).json(out.json);
    return;
  }
  res.status(200).json(subscriptionJson(out.subscription, out.signingSecret));
});

export const updateSigning = asyncHandler(async (req, res) => {
  const uid = userId(req, res);
  if (!uid) return;

  const source = decodeURIComponent(String(req.params.source ?? ''));
  const out = await webhooks.updateSigning(req.body, uid, source);
  if (!out.ok) {
    res.status(out.status).json(out.json);
    return;
  }
  res.status(200).json(subscriptionJson(out.subscription, out.signingSecret));
});

export const list = asyncHandler(async (req, res) => {
  const uid = userId(req, res);
  if (!uid) return;

  res.json({ items: await webhooks.list(uid) });
});

export const feed = asyncHandler(async (req, res) => {
  const uid = userId(req, res);
  if (!uid) return;

  const limit = Number(req.query.limit);
  const eventType =
    typeof req.query.eventType === 'string' ? req.query.eventType : undefined;
  const source = typeof req.query.source === 'string' ? req.query.source : undefined;
  const before = typeof req.query.before === 'string' ? req.query.before : undefined;

  const out = await webhooks.feed(uid, {
    limitRaw: limit,
    eventType,
    source,
    before,
  });
  if (!out.ok) {
    res.status(out.status).json(out.json);
    return;
  }
  res.json({ items: out.items });
});

export const streamFeed = asyncHandler(async (req, res) => {
  const uid = userId(req, res);
  if (!uid) return;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  (res as Response & { flushHeaders?: () => void }).flushHeaders?.();

  const write = (chunk: string) => {
    res.write(chunk);
  };

  const unsubscribe = subscribeFeed(uid, write);

  write(`event: ready\ndata: {}\n\n`);

  req.on('close', () => {
    unsubscribe();
    res.end();
  });
});

export const cancel = asyncHandler(async (req, res) => {
  const uid = userId(req, res);
  if (!uid) return;

  const source = decodeURIComponent(String(req.params.source ?? ''));
  const out = await webhooks.cancel(source, uid);
  if (!out.ok) {
    res.status(out.status).json(out.json);
    return;
  }
  res.status(200).json(out.subscription);
});

export const ingest = asyncHandler(async (req, res) => {
  const out = await webhooks.handleIncomingEvent(
    req.body,
    headerValue(req.headers, 'x-webhook-source'),
    headerValue(req.headers, 'x-ingest-key'),
    headerValue(req.headers, 'x-webhook-signature'),
    headerValue(req.headers, 'idempotency-key'),
    req.rawBody,
    req.requestId
  );
  if (!out.ok) {
    res.status(out.status).json(out.json);
    return;
  }

  const status = out.id === 'queued' ? 202 : 200;
  res.status(status).json({
    received: true,
    id: out.id,
    source: out.source,
    eventType: out.eventType,
    queued: out.id === 'queued',
  });
});
