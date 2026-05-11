# Scripts

## `simulate-webhooks.ts`

Sends sample webhook payloads to the ingest endpoint so you can see events in the dashboard without a real provider.

**From the backend directory:**

```bash
npm run simulate-webhooks
```

**Default behavior:** registers or logs in as `simulate@example.com` / `password12345`, creates a subscription for source `simulate`, then POSTs a batch of events to `http://127.0.0.1:4000/api/webhooks/events`.

**Environment variables**

| Variable                 | Purpose                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `WEBHOOK_URL`            | Ingest URL (default `http://127.0.0.1:4000/api/webhooks/events`)                                  |
| `WEBHOOK_SOURCE`         | Source label on events (default `simulate`)                                                       |
| `WEBHOOK_INGEST_KEY`     | If set, skips auth and uses this key (from the UI)                                                |
| `WEBHOOK_SIGNING_SECRET` | Hex secret when HMAC signing is enabled; sends `X-Webhook-Signature: sha256=<hmac>` over raw JSON |
| `WEBHOOK_TEST_EMAIL`     | Register/login email (default `simulate@example.com`)                                             |
| `WEBHOOK_TEST_PASSWORD`  | Register/login password (default `password12345`)                                                 |

**Example with ingest key only**

```bash
set WEBHOOK_INGEST_KEY=<key-from-dashboard>
set WEBHOOK_SOURCE=my-source
npm run simulate-webhooks
```

**Example with signing**

```bash
set WEBHOOK_SIGNING_SECRET=<secret-from-dashboard>
npm run simulate-webhooks
```
