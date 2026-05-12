import amqp from 'amqplib';

import type { WebhookQueueJob } from '../types/webhookQueueJob.js';
import { processQueuedWebhook } from './processIngestJob.js';

export const WEBHOOK_QUEUE = 'app.webhook.incoming';

let connection: Awaited<ReturnType<typeof amqp.connect>> | null = null;
let channel: amqp.Channel | null = null;
let connectFailureLogged = false;

/**
 * Normalizes the AMQP URL, converting localhost and ::1 to 127.0.0.1 for better compatibility.
 */
function normalizeAmqpUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    if (url.hostname === 'localhost' || url.hostname === '::1') {
      url.hostname = '127.0.0.1';
    }
    return url.toString();
  } catch {
    return urlStr;
  }
}

/**
 * Checks if the broker (RabbitMQ) should be used by verifying the RABBITMQ_URL environment variable.
 */
function isBrokerEnabled(): boolean {
  return Boolean(process.env.RABBITMQ_URL?.trim());
}

/**
 * Gets or creates a channel to the RabbitMQ broker. Handles connection and channel errors gracefully.
 */
async function getChannel(): Promise<amqp.Channel | null> {
  if (!isBrokerEnabled()) {
    return null;
  }

  const url = normalizeAmqpUrl(process.env.RABBITMQ_URL!.trim());

  if (channel) {
    return channel;
  }

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
      console.warn('[rabbitmq] broker unreachable; ingests run inline until connection succeeds');
      console.warn(err);
    }

    return null;
  }
}

/**
 * Publishes a webhook job to the broker queue, or processes inline if broker is unavailable.
 * @param job The webhook job to publish.
 * @returns "queued" if successfully queued, otherwise delegates to inline processing.
 */
export async function publishWebhookJob(job: WebhookQueueJob): Promise<string> {
  const ch = await getChannel();
  if (!ch) {
    return processQueuedWebhook(job);
  }

  try {
    ch.sendToQueue(
      WEBHOOK_QUEUE,
      Buffer.from(JSON.stringify(job)),
      { persistent: true }
    );
    return 'queued';
  } catch (err) {
    console.error('[rabbitmq] publish failed; ingest inline', err);
    return processQueuedWebhook(job);
  }
}

/**
 * Starts a consumer that processes jobs from the webhook queue using the provided handler.
 * Falls back to inline ingest if the broker is not available.
 * @param handler Asynchronous handler to process each WebhookQueueJob.
 */
export async function startWebhookConsumer(
  handler: (job: WebhookQueueJob) => Promise<string | void>
): Promise<void> {
  if (!isBrokerEnabled()) {
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
        } catch (err) {
          console.error('[rabbitmq] job failed', err);
          ch.nack(msg, false, false);
        }
      },
      { noAck: false }
    );
  } catch (err) {
    console.error('[rabbitmq] consume failed', err);
    channel = null;
    return;
  }

  console.log('[rabbitmq] consumer listening on', WEBHOOK_QUEUE);
}
