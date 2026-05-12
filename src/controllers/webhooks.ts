import type { Request, Response } from 'express';

import { asyncHandler, headerValue } from '../lib/utils.js';
import { subscribeFeed } from '../realtime/feedHub.js';
import {
  optionalQueryString,
  prepareEventStreamHeaders,
  replyError,
  requireAuthUserId,
  routeSourceParam,
  SSE_READY_EVENT,
  subscriptionResponseBody,
} from '../lib/webhooksHttp.js';
import * as webhookService from '../services/webhooks.service.js';

export const subscribe = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireAuthUserId(req, res);
  if (!userId) return;

  const result = await webhookService.subscribe(req.body, userId);
  if (!result.ok) {
    replyError(res, result.status, result.json);
    return;
  }

  res.status(200).json(subscriptionResponseBody(result.subscription, result.signingSecret));
});

export const updateSigning = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireAuthUserId(req, res);
  if (!userId) return;

  const source = routeSourceParam(req.params);
  const result = await webhookService.updateSigning(req.body, userId, source);
  if (!result.ok) {
    replyError(res, result.status, result.json);
    return;
  }

  res.status(200).json(subscriptionResponseBody(result.subscription, result.signingSecret));
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireAuthUserId(req, res);
  if (!userId) return;

  const items = await webhookService.list(userId);
  res.json({ items });
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireAuthUserId(req, res);
  if (!userId) return;

  const source = routeSourceParam(req.params);
  const result = await webhookService.cancel(source, userId);
  if (!result.ok) {
    replyError(res, result.status, result.json);
    return;
  }

  res.status(200).json(result.subscription);
});

export const feed = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireAuthUserId(req, res);
  if (!userId) return;

  const result = await webhookService.feed(userId, {
    limitRaw: Number(req.query.limit),
    eventType: optionalQueryString(req.query, 'eventType'),
    source: optionalQueryString(req.query, 'source'),
    before: optionalQueryString(req.query, 'before'),
  });

  if (!result.ok) {
    replyError(res, result.status, result.json);
    return;
  }

  res.json({ items: result.items });
});

export const streamFeed = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireAuthUserId(req, res);
  if (!userId) return;

  prepareEventStreamHeaders(res);

  const send = (chunk: string) => {
    res.write(chunk);
  };

  const unsubscribe = subscribeFeed(userId, send);
  send(SSE_READY_EVENT);

  req.on('close', () => {
    unsubscribe();
    res.end();
  });
});

export const ingest = asyncHandler(async (req: Request, res: Response) => {
  const result = await webhookService.handleIncomingEvent(
    req.body,
    headerValue(req.headers, 'x-webhook-source'),
    headerValue(req.headers, 'x-ingest-key'),
    headerValue(req.headers, 'x-webhook-signature'),
    headerValue(req.headers, 'idempotency-key'),
    req.rawBody,
    req.requestId
  );

  if (!result.ok) {
    replyError(res, result.status, result.json);
    return;
  }

  const statusCode = result.id === 'queued' ? 202 : 200;
  res.status(statusCode).json({
    received: true,
    id: result.id,
    source: result.source,
    eventType: result.eventType,
    queued: result.id === 'queued',
  });
});
