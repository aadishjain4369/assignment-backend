import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { verifyAuthToken } from '../services/authService.js';

type AuthMode = 'bearer' | 'query';

export function authMiddleware(mode: AuthMode): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    let raw = '';
    if (mode === 'bearer') {
      const header = req.headers.authorization;
      raw =
        typeof header === 'string' && header.startsWith('Bearer ')
          ? header.slice(7).trim()
          : '';
      if (!raw) {
        res.status(401).json({ error: 'Missing Authorization: Bearer <token>' });
        return;
      }
    } else {
      raw =
        typeof req.query.access_token === 'string' ? req.query.access_token.trim() : '';
      if (!raw) {
        res.status(401).json({ error: 'Missing access_token query parameter' });
        return;
      }
    }

    try {
      req.auth = verifyAuthToken(raw);
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}
