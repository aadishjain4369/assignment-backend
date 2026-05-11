import mongoose from 'mongoose';

const webhookDeliverySchema = new mongoose.Schema(
  {
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WebhookSubscription',
      required: true,
      index: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WebhookEvent',
      required: true,
      index: true,
    },
    targetUrl: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'delivered', 'failed'],
      index: true,
    },
    attempts: { type: Number, required: true, default: 0 },
    maxAttempts: { type: Number, required: true, default: 5 },
    nextRetryAt: { type: Date, required: true, index: true },
    lastError: { type: String },
    lastAttemptAt: { type: Date },
  },
  { timestamps: true }
);

webhookDeliverySchema.index({ status: 1, nextRetryAt: 1 });

export const WebhookDelivery = mongoose.model('WebhookDelivery', webhookDeliverySchema);
