import type { IncomingHttpHeaders } from 'http';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';

export function headerValue(
  headers: IncomingHttpHeaders,
  name: string
): string | undefined {
  const v = headers[name];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

export function isMongoDuplicateKey(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 11_000
  );
}

export function parseObjectId(id: string): mongoose.Types.ObjectId | null {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(id);
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}

export type ServiceFail = { ok: false; status: number; json: object };

export function validationError(err: unknown): ServiceFail | null {
  if (err instanceof ZodError) {
    return {
      ok: false,
      status: 400,
      json: { error: 'Validation failed', details: err.flatten() },
    };
  }
  return null;
}
