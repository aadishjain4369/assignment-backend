import type { Request, Response } from 'express';

import { asyncHandler } from '../lib/utils.js';
import { accessTokenForUser } from '../lib/authToken.js';
import * as userService from '../services/userService.js';
import { loginBodySchema, registerBodySchema } from '../validation/schemas.js';

function tokenResponse(userId: string, email: string) {
  const token = accessTokenForUser(userId);
  return {
    token,
    tokenType: 'Bearer' as const,
    user: { id: userId, email },
  };
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const body = registerBodySchema.parse(req.body);
  const user = await userService.createUser(body.email.toLowerCase(), body.password);
  res.status(201).json(tokenResponse(user.id, user.email));
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = loginBodySchema.parse(req.body);
  const email = body.email.toLowerCase();
  const user = await userService.findUserByEmail(email);
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const ok = await userService.verifyPassword(body.password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  res.json(tokenResponse(user._id.toString(), user.email));
});
