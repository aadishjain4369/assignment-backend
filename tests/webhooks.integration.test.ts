import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { WebhookEvent } from '../src/models/webhookEvent.js';

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'vitest-jwt-secret-at-least-32-characters-long';
delete process.env.RABBITMQ_URL;

const mongoUri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/spezia_vitest';

const app = createApp();

describe('webhooks API', () => {
  beforeAll(async () => {
    await mongoose.connect(mongoUri);
    await WebhookEvent.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase().catch(() => undefined);
    await mongoose.disconnect();
  });

  it('register, subscribe, ingest, feed, idempotency', async () => {
    const email = `u_${Date.now().toString(36)}@itest.local`;
    const password = 'password12345';

    const reg = await request(app).post('/api/auth/register').send({ email, password });
    expect(reg.status).toBe(201);
    const token = reg.body.token as string;
    expect(token).toBeTruthy();

    const sub = await request(app)
      .post('/api/webhooks/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ source: 'integration-test' });
    expect(sub.status).toBe(200);
    const ingestKey = sub.body.ingestKey as string;
    expect(ingestKey).toBeTruthy();

    const payload = {
      type: 'order.paid',
      id: 'ext_evt_1',
      source: 'integration-test',
      ingestKey,
      data: { amount: 1 },
    };

    const ingest1 = await request(app)
      .post('/api/webhooks/events')
      .set('X-Ingest-Key', ingestKey)
      .set('Idempotency-Key', 'idem-1')
      .send(payload);
    expect([200, 202]).toContain(ingest1.status);
    const firstId = ingest1.body.id as string;
    expect(firstId).toBeTruthy();

    const ingestDup = await request(app)
      .post('/api/webhooks/events')
      .set('X-Ingest-Key', ingestKey)
      .set('Idempotency-Key', 'idem-1')
      .send(payload);
    expect([200, 202]).toContain(ingestDup.status);
    expect(ingestDup.body.id).toBe(firstId);

    const feed = await request(app)
      .get('/api/webhooks/feed?limit=20')
      .set('Authorization', `Bearer ${token}`);
    expect(feed.status).toBe(200);
    const items = feed.body.items as { _id: string }[];
    const match = items.filter((i) => i._id === firstId);
    expect(match.length).toBe(1);

    const byExternal = await WebhookEvent.countDocuments({
      externalId: 'ext_evt_1',
      source: 'integration-test',
    });
    expect(byExternal).toBe(1);
  });
});
