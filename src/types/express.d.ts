declare global {
  namespace Express {
    interface Request {
      auth?: { sub: string; iat?: number; exp?: number };
      rawBody?: Buffer;
      requestId?: string;
    }
  }
}

export {};
