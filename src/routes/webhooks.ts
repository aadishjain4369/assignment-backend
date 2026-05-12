import { Router } from 'express';

import * as webhook from '../controllers/webhooks.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { ingestRateLimit } from '../middleware/ingestRateLimit.js';

export const webhooksOpenApiPaths = {
  '/api/webhooks/events': {
    post: {
      tags: ['Webhooks — ingest'],
      summary: 'Inbound webhook (ingest key / optional HMAC, not JWT)',
      parameters: [
        {
          name: 'X-Ingest-Key',
          in: 'header',
          schema: { type: 'string' },
          description: 'Per-subscription ingest key (can also be sent in JSON body)',
        },
        {
          name: 'X-Webhook-Signature',
          in: 'header',
          schema: { type: 'string' },
          description: 'sha256=<hex> when signing is enabled for the subscription',
        },
        {
          name: 'Idempotency-Key',
          in: 'header',
          schema: { type: 'string' },
        },
      ],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description:
                'Provider payload; include type, id, source; ingestKey optional if using header',
            },
          },
        },
      },
      responses: {
        '200': { description: 'Accepted / processed synchronously' },
        '202': { description: 'Queued (broker)' },
      },
    },
  },
  '/api/webhooks/subscriptions': {
    post: {
      tags: ['Webhooks — subscriptions'],
      summary: 'Create or update subscription',
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['source'],
              properties: {
                source: { type: 'string' },
                callbackUrl: { type: 'string', format: 'uri' },
                enableSigning: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: { '200': { description: 'Subscription saved' } },
    },
    get: {
      tags: ['Webhooks — subscriptions'],
      summary: 'List subscriptions',
      security: [{ bearerAuth: [] }],
      responses: { '200': { description: 'OK' } },
    },
  },
  '/api/webhooks/subscriptions/{source}': {
    delete: {
      tags: ['Webhooks — subscriptions'],
      summary: 'Cancel subscription',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'source',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': { description: 'Cancelled' },
        '404': { description: 'Not found' },
      },
    },
  },
  '/api/webhooks/subscriptions/{source}/signing': {
    post: {
      tags: ['Webhooks — subscriptions'],
      summary: 'Rotate or disable inbound signing secret',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'source',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['action'],
              properties: {
                action: { type: 'string', enum: ['rotate', 'disable'] },
              },
            },
          },
        },
      },
      responses: { '200': { description: 'OK' } },
    },
  },
  '/api/webhooks/feed': {
    get: {
      tags: ['Webhooks — feed'],
      summary: 'Paged event history',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
        { name: 'eventType', in: 'query', schema: { type: 'string' } },
        { name: 'source', in: 'query', schema: { type: 'string' } },
        { name: 'before', in: 'query', schema: { type: 'string' } },
      ],
      responses: { '200': { description: 'OK' } },
    },
  },
  '/api/webhooks/feed/stream': {
    get: {
      tags: ['Webhooks — feed'],
      summary: 'SSE live feed (?access_token= JWT — EventSource cannot send headers)',
      parameters: [
        {
          name: 'access_token',
          in: 'query',
          required: true,
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': {
          description: 'text/event-stream',
          content: {
            'text/event-stream': { schema: { type: 'string' } },
          },
        },
      },
    },
  },
};

export const webhookRouter = Router();

webhookRouter.post('/events', ingestRateLimit, webhook.ingest);

webhookRouter.get('/feed/stream', authMiddleware('query'), webhook.streamFeed);

const secured = Router();
secured.use(authMiddleware('bearer'));
secured.post('/subscriptions', webhook.subscribe);
secured.post('/subscriptions/:source/signing', webhook.updateSigning);
secured.get('/subscriptions', webhook.list);
secured.get('/feed', webhook.feed);
secured.delete('/subscriptions/:source', webhook.cancel);

webhookRouter.use(secured);
