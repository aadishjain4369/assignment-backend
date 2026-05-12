import type { Request, Response } from 'express';

import { validatePlainObject } from './utils.js';

export const SIGNING_SECRET_NOTE =
  'This is your Spenzia assignment secret. Save it now, as it can only be seen once. Send X-Webhook-Signature: sha256=<hex> (HMAC-SHA256 of the raw JSON body).';

export const SSE_READY_EVENT = `event: ready\ndata: {}\n\n`;

export type FlushableResponse = Response & { flushHeaders?: () => void };

export function subscriptionResponseBody(
  subscription: unknown,
  signingSecret?: string
): Record<string, unknown> {
  const body = validatePlainObject(subscription);
  if (signingSecret) {
    body.signingSecret = signingSecret;
    body.signingSecretNote = SIGNING_SECRET_NOTE;
  }
  return body;
}

export function replyError(res: Response, status: number, body: object): void {
  res.status(status).json(body);
}

export function requireAuthUserId(req: Request, res: Response): string | undefined {
  const id = req.auth?.sub;
  if (!id) {
    replyError(res, 401, { error: 'Unauthorized' });
    return undefined;
  }
  return id;
}

export function routeSourceParam(params: Request['params']): string {
  return decodeURIComponent(String(params.source ?? ''));
}

export function optionalQueryString(
  query: Request['query'],
  key: string
): string | undefined {
  const v = query[key];
  return typeof v === 'string' ? v : undefined;
}

export function prepareEventStreamHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  (res as FlushableResponse).flushHeaders?.();
}
