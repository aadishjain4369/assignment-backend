import jwt, { type SignOptions } from 'jsonwebtoken';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export function signAuthToken(userId: string): string {
  const secret = requireEnv('JWT_SECRET');
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? '8h') as NonNullable<
    SignOptions['expiresIn']
  >;
  const options: SignOptions = { expiresIn };
  return jwt.sign({ sub: userId }, secret, options);
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
