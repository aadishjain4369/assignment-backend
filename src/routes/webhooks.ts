import { Router } from 'express';

import * as webhook from '../controllers/webhooks.js';
import { ingestRateLimit } from '../middleware/ingestRateLimit.js';
import { requireJwt } from '../middleware/requireJwt.js';
import { requireJwtSse } from '../middleware/requireJwtSse.js';

export const webhookRouter = Router();

webhookRouter.post('/events', ingestRateLimit, webhook.ingest);

const secured = Router();
secured.use(requireJwt);
secured.post('/subscriptions', webhook.subscribe);
secured.post('/subscriptions/:source/signing', webhook.updateSigning);
secured.get('/subscriptions', webhook.list);
secured.get('/feed', webhook.feed);
secured.delete('/subscriptions/:source', webhook.cancel);

webhookRouter.use(secured);

const sse = Router();
sse.use(requireJwtSse);
sse.get('/feed/stream', webhook.streamFeed);

webhookRouter.use(sse);
