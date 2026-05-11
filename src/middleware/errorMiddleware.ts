import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { HttpError, isHttpError } from '../lib/errors.js';
import { logError } from '../lib/log.js';
import { isMongoDuplicateKey } from '../lib/utils.js';

export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId;

  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: err.flatten() });
    return;
  }

  if (isHttpError(err)) {
    if (err.expose) {
      res.status(err.status).json({ error: err.message });
    } else {
      logError(err.message, { requestId, stack: err.stack });
      res.status(err.status).json({ error: 'Internal server error' });
    }
    return;
  }

  if (isMongoDuplicateKey(err)) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  logError('unhandled error', {
    requestId,
    err: err instanceof Error ? err.message : String(err),
  });
  res.status(500).json({ error: 'Internal server error' });
}
