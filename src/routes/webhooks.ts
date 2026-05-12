import { Router } from 'express';

import * as webhook from '../controllers/webhooks.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { ingestRateLimit } from '../middleware/ingestRateLimit.js';

export const webhookRouter = Router();

webhookRouter.post('/events', ingestRateLimit, webhook.ingest);

// Must be registered before `secured`: that router applies Bearer-only auth
// to every path, which would 401 SSE clients that only send `?access_token=`.
webhookRouter.get('/feed/stream', authMiddleware('query'), webhook.streamFeed);

const secured = Router();
secured.use(authMiddleware('bearer'));
secured.post('/subscriptions', webhook.subscribe);
secured.post('/subscriptions/:source/signing', webhook.updateSigning);
secured.get('/subscriptions', webhook.list);
secured.get('/feed', webhook.feed);
secured.delete('/subscriptions/:source', webhook.cancel);

webhookRouter.use(secured);
