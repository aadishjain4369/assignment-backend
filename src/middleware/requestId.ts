import { randomUUID } from 'crypto';

import type { NextFunction, Request, Response } from 'express';

import { headerValue } from '../lib/utils.js';

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const fromClient = headerValue(req.headers, 'x-request-id')?.trim();
  const id = fromClient && fromClient.length > 0 ? fromClient : randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
