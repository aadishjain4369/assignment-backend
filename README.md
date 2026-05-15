# Webhook platform — backend

Express + TypeScript service for webhook subscriptions (JWT dashboard), signed or key-based ingest, storing events in MongoDB, and retrying outbound delivery to callback URLs. **RabbitMQ** is optional: set `RABBITMQ_URL` to queue ingests; otherwise they run inline.

## How to run

1. **Node.js 18+** and **MongoDB** available (default URI: `mongodb://127.0.0.1:27017/webhooks` unless you set `MONGODB_URI` in `.env`).
2. Install dependencies: `npm install`
3. Start dev (first run copies `.env` from `.env.example` if `.env` is missing): `npm run dev`
4. **RabbitMQ (optional):** if you enable **`RABBITMQ_URL`** in `.env`, start the broker: `docker compose up -d` (Compose is RabbitMQ-only; see `docker-compose.yml`).
5. **Checks:** `GET /health` · **API docs:** `http://localhost:4000/api/swagger` (adjust host/port if `PORT` ≠ 4000).

Production-style: `npm run build && npm start`

## Simulate webhooks

From the dashboard, create a subscription and copy its **ingest key**. **`WEBHOOK_SOURCE`** must match that subscription’s **source**. Run commands from the **`assignment-backend`** directory with the API already up (`npm run dev`).

**macOS / Linux (bash)** — ingest key only:

```bash
export WEBHOOK_INGEST_KEY='paste-ingest-key-here'
export WEBHOOK_SOURCE='my-source'
npm run simulate-webhooks
```

**macOS / Linux (bash)** — if signing is enabled for that subscription (hex secret from the UI):

```bash
export WEBHOOK_INGEST_KEY='paste-ingest-key-here'
export WEBHOOK_SIGNING_SECRET='paste-signing-secret-hex-here'
export WEBHOOK_SOURCE='my-source'
npm run simulate-webhooks
```

**Windows (PowerShell)** — ingest key only:

```powershell
$env:WEBHOOK_INGEST_KEY = 'paste-ingest-key-here'
$env:WEBHOOK_SOURCE = 'my-source'
npm run simulate-webhooks
```

**Windows (PowerShell)** — with signing:

```powershell
$env:WEBHOOK_INGEST_KEY = 'paste-ingest-key-here'
$env:WEBHOOK_SIGNING_SECRET = 'paste-signing-secret-hex-here'
$env:WEBHOOK_SOURCE = 'my-source'
npm run simulate-webhooks
```

## How this maps to the assignment

| Requirement               | What we implemented                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Node HTTP server          | **Express** — `createApp`, `routes/`, `controllers/`                                                                                      |
| Subscribe                 | `POST /api/webhooks/subscriptions` (JWT) — `webhooksSubscriptions.service`; returns **ingest key**                                        |
| List subscriptions        | `GET /api/webhooks/subscriptions` (JWT)                                                                                                   |
| Incoming events           | `POST /api/webhooks/events` — ingest key / optional HMAC; `publishWebhookJob` → persist `WebhookEvent`; outbound queue if **callbackUrl** |
| Database                  | **MongoDB** + Mongoose — `WebhookSubscription`, `WebhookEvent`                                                                            |
| JWT auth                  | `/api/auth/register`, `/api/auth/login`; **Bearer** on management routes; SSE uses query token                                            |
| Process & store events    | `webhooksIngest.service` (`processEventByType`), `processIngestJob`                                                                       |
| Validation & errors       | **Zod** (`validation/schemas.ts`); `errorMiddleware` / service `Fail` types                                                               |
| Retry failed deliveries   | `deliveryService` + `processDueDeliveries` interval in `index.ts`                                                                         |
| Cancel subscription       | Deactivate by source (JWT)                                                                                                                |
| Webhook simulation        | `npm run simulate-webhooks` — see **`scripts/README.md`**                                                                                 |
| Bonus: filtering / typing | `processEventByType` tags by **type**                                                                                                     |
| Bonus: signing            | Optional **HMAC-SHA256** (`X-Webhook-Signature`) per subscription                                                                         |
| Bonus: message broker     | **RabbitMQ** via `RABBITMQ_URL`; inline fallback if broker off or down                                                                    |
| API documentation         | **Swagger UI** at `GET /api/swagger`                                                                                                      |

## Explanation

**Inbound:** `POST …/events` validates key/signature → `publishWebhookJob` (queue or inline) → `processQueuedWebhook` → save event → enqueue outbound POST when a callback URL exists.

**Outbound:** A timer runs `processDueDeliveries`: POST envelope with **fetch**, backoff and retries per `deliveryService`.

**Layout:** Thin controllers and routes; logic in **`services/`** (`webhooksSubscriptions`, `webhooksIngest`, `auth`, `delivery`, **`brokerService`**, `processIngestJob`); helpers in `lib/webhooksHttp.ts`.

**Security:** Rate limit on ingest; JWT on dashboard APIs; optional inbound HMAC; CORS tied to **`FRONTEND_ORIGIN`**.

**Simulator:** See **Simulate webhooks** above; extra env vars in **`scripts/README.md`**.

**Frontend:** Point the SPA’s **`VITE_API_URL`** at this API (e.g. `http://localhost:4000`) and match **`FRONTEND_ORIGIN`** to the Vite dev origin.
