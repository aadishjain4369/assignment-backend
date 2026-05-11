import { createHmac } from 'node:crypto';

const WEBHOOK_SOURCE = process.env.WEBHOOK_SOURCE ?? 'simulate';
const WEBHOOK_URL =
  process.env.WEBHOOK_URL ?? 'http://127.0.0.1:4000/api/webhooks/events';
const WEBHOOK_INGEST_KEY = process.env.WEBHOOK_INGEST_KEY?.trim() ?? '';
const WEBHOOK_SIGNING_SECRET = process.env.WEBHOOK_SIGNING_SECRET?.trim() ?? '';

const TEST_EMAIL = process.env.WEBHOOK_TEST_EMAIL ?? 'simulate@example.com';
const TEST_PASSWORD = process.env.WEBHOOK_TEST_PASSWORD ?? 'password12345';

function apiOrigin(eventsUrl: string): string {
  return new URL(eventsUrl).origin;
}

function subscriptionsUrlFromEventsUrl(eventsUrl: string): string {
  return eventsUrl.replace(/\/?events\/?$/i, '/subscriptions');
}

function signatureHeader(secret: string, rawBody: string): string {
  const hex = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return `sha256=${hex}`;
}

async function ensureUserAndToken(origin: string): Promise<string> {
  const reg = await fetch(`${origin}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  if (reg.ok) {
    const data = (await reg.json()) as { token?: string };
    if (data.token) return data.token;
  }

  const login = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  const text = await login.text();
  if (!login.ok) {
    throw new Error(`Auth failed (register/login): ${text}`);
  }
  const data = JSON.parse(text) as { token?: string };
  if (!data.token) throw new Error('No token from login');
  return data.token;
}

const sampleEvents = [
  {
    id: 'evt_001',
    type: 'user.created',
    createdAt: new Date().toISOString(),
    data: { userId: 'usr_abc123', email: 'demo@example.com' },
  },
  {
    id: 'evt_002',
    type: 'order.paid',
    createdAt: new Date().toISOString(),
    data: { orderId: 'ord_xyz789', amountCents: 4999, currency: 'usd' },
  },
  {
    id: 'evt_003',
    type: 'integration.test',
    createdAt: new Date().toISOString(),
    data: { source: 'simulate-webhooks', ok: true },
  },
  {
    id: 'evt_004',
    type: 'subscription.updated',
    createdAt: new Date().toISOString(),
    data: { subscriptionId: 'sub_7f2a', status: 'active', planId: 'plan_pro' },
  },
  {
    id: 'evt_005',
    type: 'shipment.shipped',
    createdAt: new Date().toISOString(),
    data: {
      orderId: 'ord_xyz789',
      carrier: 'ups',
      trackingNumber: '1Z999AA10123456784',
    },
  },
  {
    id: 'evt_006',
    type: 'invoice.finalized',
    createdAt: new Date().toISOString(),
    data: { invoiceId: 'inv_4k9m', customerId: 'cus_2n8p', totalCents: 12900 },
  },
  {
    id: 'evt_007',
    type: 'payment.failed',
    createdAt: new Date().toISOString(),
    data: {
      paymentId: 'pay_8q3r',
      orderId: 'ord_fail_01',
      reason: 'card_declined',
      declineCode: 'insufficient_funds',
    },
  },
  {
    id: 'evt_008',
    type: 'refund.processed',
    createdAt: new Date().toISOString(),
    data: { refundId: 'rfnd_6t1w', paymentId: 'pay_8q3r', amountCents: 1999 },
  },
  {
    id: 'evt_009',
    type: 'cart.abandoned',
    createdAt: new Date().toISOString(),
    data: { cartId: 'cart_m5vx', itemCount: 3, valueCents: 8750 },
  },
  {
    id: 'evt_010',
    type: 'user.login',
    createdAt: new Date().toISOString(),
    data: {
      userId: 'usr_abc123',
      ip: '203.0.113.42',
      userAgent: 'Mozilla/5.0 (simulate)',
    },
  },
  {
    id: 'evt_011',
    type: 'api_key.rotated',
    createdAt: new Date().toISOString(),
    data: { keyId: 'key_9h4j', masked: 'sk_live_••••last4', rotatedBy: 'usr_admin_01' },
  },
  {
    id: 'evt_012',
    type: 'inventory.low_stock',
    createdAt: new Date().toISOString(),
    data: { sku: 'SKU-BEAN-500G', quantity: 4, warehouseId: 'wh_us_west' },
  },
] as const;

async function ensureSubscribed(
  token: string
): Promise<{ ingestKey: string; source: string }> {
  const url = subscriptionsUrlFromEventsUrl(WEBHOOK_URL);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ source: WEBHOOK_SOURCE }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Subscribe failed ${res.status}: ${text}`);
  }
  const sub = JSON.parse(text) as { ingestKey?: string; source?: string };
  if (!sub.ingestKey) throw new Error('Subscribe response missing ingestKey');
  console.log('Subscribed', sub.source, 'ingestKey', sub.ingestKey.slice(0, 8) + '…');
  return { ingestKey: sub.ingestKey, source: sub.source ?? WEBHOOK_SOURCE };
}

async function postWebhook(
  body: Record<string, unknown>,
  ingestKey: string
): Promise<void> {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Ingest-Key': ingestKey,
  };
  if (WEBHOOK_SIGNING_SECRET) {
    headers['X-Webhook-Signature'] = signatureHeader(WEBHOOK_SIGNING_SECRET, raw);
  }
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers,
    body: raw,
  });
  const text = await res.text();
  console.log(res.ok ? 'OK' : 'FAIL', res.status, WEBHOOK_URL, '—', text.slice(0, 120));
}

async function main(): Promise<void> {
  let ingestKey: string;

  if (WEBHOOK_INGEST_KEY) {
    ingestKey = WEBHOOK_INGEST_KEY;
    console.log(
      'Using WEBHOOK_INGEST_KEY from env (skipping auth/subscribe). Source label:',
      WEBHOOK_SOURCE
    );
  } else {
    const origin = apiOrigin(WEBHOOK_URL);
    const token = await ensureUserAndToken(origin);
    const sub = await ensureSubscribed(token);
    ingestKey = sub.ingestKey;
  }

  console.log('Posting', sampleEvents.length, 'events to', WEBHOOK_URL);

  for (const payload of sampleEvents) {
    await postWebhook({ ...payload, source: WEBHOOK_SOURCE, ingestKey }, ingestKey);
    await new Promise((r) => setTimeout(r, 250));
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
