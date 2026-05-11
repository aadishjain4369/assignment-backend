import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { startWebhookConsumer } from './services/brokerService.js';
import { processDueDeliveries } from './services/deliveryService.js';
import { processQueuedWebhook } from './services/processIngestJob.js';

const port = Number(process.env.PORT) || 3000;
const mongoUri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/spezia';

async function main(): Promise<void> {
  if (!process.env.JWT_SECRET) {
    console.warn('[startup] JWT_SECRET is unset; auth will fail until it is set.');
  }

  await mongoose.connect(mongoUri);
  console.log('MongoDB:', mongoUri.replace(/:[^:@]+@/, ':****@'));

  await startWebhookConsumer(processQueuedWebhook);

  setInterval(() => {
    void processDueDeliveries().catch((e) => console.error('[delivery]', e));
  }, 20_000);

  const app = createApp();
  app.listen(port, () => {
    console.log(`http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
