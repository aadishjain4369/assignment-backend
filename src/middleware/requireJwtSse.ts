import type { NextFunction, Request, Response } from 'express';

import { verifyAuthToken } from '../services/authService.js';

export function requireJwtSse(req: Request, res: Response, next: NextFunction): void {
  const raw =
    typeof req.query.access_token === 'string' ? req.query.access_token.trim() : '';
  if (!raw) {
    res.status(401).json({ error: 'Missing access_token query parameter' });
    return;
  }

  try {
    req.auth = verifyAuthToken(raw);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
