import { z } from 'zod';

export const registerBodySchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8, 'password must be at least 8 characters').max(200),
});

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const subscribeBodySchema = z.object({
  source: z.string().trim().min(1, 'source is required').max(200),
  callbackUrl: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.string().url('callbackUrl must be a valid URL').optional()
  ),
  enableSigning: z.boolean().optional(),
});

export const signingActionSchema = z.object({
  action: z.enum(['rotate', 'disable']),
});

export const incomingEventBodySchema = z
  .unknown()
  .refine(
    (v): v is Record<string, unknown> =>
      v !== null && typeof v === 'object' && !Array.isArray(v),
    { message: 'Body must be a JSON object' }
  );
