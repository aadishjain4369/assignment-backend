import type { NextFunction, Request, Response } from 'express';

import { verifyAuthToken } from '../services/authService.js';

export function requireJwt(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const raw =
    typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice(7).trim()
      : '';

  if (!raw) {
    res.status(401).json({ error: 'Missing Authorization: Bearer <token>' });
    return;
  }

  try {
    req.auth = verifyAuthToken(raw);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
