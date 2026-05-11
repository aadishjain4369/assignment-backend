import mongoose from 'mongoose';

const webhookEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    source: { type: String, required: true, index: true },
    eventType: { type: String, required: true, index: true },
    externalId: { type: String },
    idempotencyKey: { type: String },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    processingTags: [{ type: String }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

webhookEventSchema.index(
  { userId: 1, source: 1, externalId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      externalId: { $exists: true, $type: 'string', $regex: /^.+$/ },
    },
  }
);

webhookEventSchema.index(
  { userId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $exists: true, $type: 'string', $regex: /^.+$/ },
    },
  }
);

export const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);
