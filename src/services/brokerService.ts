import amqp from 'amqplib';

import type { WebhookQueueJob } from '../types/webhookQueueJob.js';
import { processQueuedWebhook } from './processIngestJob.js';

export const WEBHOOK_QUEUE = 'spezia.webhook.incoming';

let connection: Awaited<ReturnType<typeof amqp.connect>> | null = null;

function normalizeAmqpUrl(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    if (u.hostname === 'localhost' || u.hostname === '::1') {
      u.hostname = '127.0.0.1';
    }
    return u.toString();
  } catch {
    return urlStr;
  }
}

function useBroker(): boolean {
  return Boolean(process.env.RABBITMQ_URL?.trim());
}

let channel: amqp.Channel | null = null;

let connectFailureLogged = false;

async function getChannel(): Promise<amqp.Channel | null> {
  if (!useBroker()) return null;
  const url = normalizeAmqpUrl(process.env.RABBITMQ_URL!.trim());
  if (channel) return channel;

  try {
    if (!connection) {
      connection = await amqp.connect(url);
      connectFailureLogged = false;
      connection.on('error', (err) => {
        console.error('[rabbitmq] connection error', err);
        connection = null;
        channel = null;
      });
      connection.on('close', () => {
        connection = null;
        channel = null;
      });
    }

    channel = await connection.createChannel();
    channel.on('error', (err) => {
      console.error('[rabbitmq] channel error', err);
      channel = null;
    });

    await channel.assertQueue(WEBHOOK_QUEUE, { durable: true });

    return channel;
  } catch (err) {
    connection = null;
    channel = null;
    if (!connectFailureLogged) {
      connectFailureLogged = true;
      console.warn(
        '[rabbitmq] broker unreachable; ingests run inline until connection succeeds'
      );
      console.warn(err);
    }
    return null;
  }
}

export async function publishWebhookJob(job: WebhookQueueJob): Promise<string> {
  const ch = await getChannel();
  if (!ch) {
    return processQueuedWebhook(job);
  }

  try {
    ch.sendToQueue(WEBHOOK_QUEUE, Buffer.from(JSON.stringify(job)), {
      persistent: true,
    });
    return 'queued';
  } catch (e) {
    console.error('[rabbitmq] publish failed; ingest inline', e);
    return processQueuedWebhook(job);
  }
}

export async function startWebhookConsumer(
  handler: (job: WebhookQueueJob) => Promise<string | void>
): Promise<void> {
  if (!useBroker()) {
    console.log('[rabbitmq] RABBITMQ_URL unset; ingests are synchronous');
    return;
  }

  const ch = await getChannel();
  if (!ch) {
    console.log('[rabbitmq] consumer offline (same as inline ingest)');
    return;
  }

  try {
    await ch.consume(
      WEBHOOK_QUEUE,
      async (msg) => {
        if (!msg) return;
        try {
          const job = JSON.parse(msg.content.toString()) as WebhookQueueJob;
          await handler(job);
          ch.ack(msg);
        } catch (e) {
          console.error('[rabbitmq] job failed', e);
          ch.nack(msg, false, false);
        }
      },
      { noAck: false }
    );
  } catch (e) {
    console.error('[rabbitmq] consume failed', e);
    channel = null;
    return;
  }

  console.log('[rabbitmq] consumer listening on', WEBHOOK_QUEUE);
}
