import cors from 'cors';
import express, { type Request } from 'express';

import openApiDocument from './openapi/openapi.json' with { type: 'json' };
import { errorMiddleware } from './middleware/errorMiddleware.js';
import { ingestRateLimit } from './middleware/ingestRateLimit.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { authRouter } from './routes/auth.js';
import { webhookRouter } from './routes/webhooks.js';

export function createApp(): express.Express {
  const app = express();
  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

  app.use(requestIdMiddleware);
  app.use(
    cors({
      origin: frontendOrigin,
      credentials: true,
    })
  );
  app.use(
    express.json({
      limit: process.env.JSON_BODY_LIMIT ?? '256kb',
      verify: (req, _res, buf) => {
        (req as Request).rawBody = buf;
      },
    })
  );

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });

  app.use('/api/auth', authRouter);
  app.use('/api/webhooks', webhookRouter);
  app.use(errorMiddleware);

  return app;
}
