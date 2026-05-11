export type WebhookQueueJob = {
  subscriptionId: string;
  userId: string;
  ingestKey: string;
  parsedBody: Record<string, unknown>;
  receivedAt: string;
  requestId?: string;
};
