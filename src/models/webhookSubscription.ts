import mongoose from 'mongoose';

const webhookSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    source: { type: String, required: true, trim: true },
    ingestKey: { type: String, required: true, unique: true },
    callbackUrl: { type: String, trim: true },
    active: { type: Boolean, default: true },
    cancelledAt: { type: Date },
    signingEnabled: { type: Boolean, default: false },
    signingSecret: { type: String, select: false },
  },
  { timestamps: true }
);

webhookSubscriptionSchema.index({ userId: 1, source: 1 }, { unique: true });

export const WebhookSubscription = mongoose.model(
  'WebhookSubscription',
  webhookSubscriptionSchema
);
