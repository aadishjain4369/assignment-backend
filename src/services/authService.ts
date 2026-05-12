import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';

import { HttpError } from '../lib/errors.js';
import { User } from '../models/user.js';

const SALT_ROUNDS = 10;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

// ─── Users (credentials) ───────────────────────────────────────────────────

export async function createUser(
  email: string,
  password: string
): Promise<{ id: string; email: string }> {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const doc = await User.create({ email, passwordHash });
  return { id: doc._id.toString(), email: doc.email };
}

export async function findUserByEmail(email: string) {
  return User.findOne({ email: email.toLowerCase() });
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

// ─── JWT ───────────────────────────────────────────────────────────────────

export function signAuthToken(userId: string): string {
  const secret = requireEnv('JWT_SECRET');
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? '8h') as NonNullable<
    SignOptions['expiresIn']
  >;
  const options: SignOptions = { expiresIn };
  return jwt.sign({ sub: userId }, secret, options);
}

export function accessTokenForUser(userId: string): string {
  try {
    return signAuthToken(userId);
  } catch {
    throw new HttpError(500, 'Auth is misconfigured (set JWT_SECRET in the environment)');
  }
}

export function verifyAuthToken(token: string): { sub: string } {
  const secret = requireEnv('JWT_SECRET');
  const decoded = jwt.verify(token, secret);
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    typeof (decoded as { sub?: unknown }).sub !== 'string'
  ) {
    throw new Error('Invalid token payload');
  }
  return { sub: (decoded as { sub: string }).sub };
}
