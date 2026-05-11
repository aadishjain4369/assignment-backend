export type ProcessResult = { tags: string[]; note?: string };

const BILLING_TYPES = new Set([
  'order.paid',
  'invoice.finalized',
  'refund.processed',
  'subscription.updated',
]);

const RISK_TYPES = new Set(['payment.failed', 'api_key.rotated']);

const INVENTORY_TYPES = new Set(['inventory.low_stock', 'shipment.shipped']);

export function processEventByType(
  eventType: string,
  _payload: Record<string, unknown>
): ProcessResult {
  const tags: string[] = [`type:${eventType}`];

  if (BILLING_TYPES.has(eventType)) tags.push('domain:billing');
  if (RISK_TYPES.has(eventType)) tags.push('domain:risk');
  if (INVENTORY_TYPES.has(eventType)) tags.push('domain:inventory');

  return { tags, note: 'filtered' };
}
