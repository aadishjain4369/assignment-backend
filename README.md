## Webhook Platform — Backend

An Express + TypeScript service that powers webhook subscription management, event ingestion, and outbound delivery — with MongoDB for storage and optional RabbitMQ for message queuing.

Handles **JWT-authenticated** subscription APIs, **key or HMAC-signed** ingest, **MongoDB-backed** event storage, and **automatic retry** of outbound deliveries to callback URLs. RabbitMQ is opt-in — without it, everything runs inline.

---

## Getting Started

**Prerequisites:** Node.js 18+, MongoDB running locally (or set `MONGODB_URI`)

```bash
# 1. Clone
git clone https://github.com/aadishjain4369/assignment-backend.git
cd assignment-backend

# 2. Install dependencies
npm install

# 3. Start dev server — copies .env from .env.example on first run
npm run dev
```

- Health check: `GET /health`
- API docs (Swagger): `http://localhost:4000/api/swagger`

**RabbitMQ (optional):** set `RABBITMQ_URL` in `.env`, then:

```bash
docker compose up -d   # starts broker only
```

Without it, ingests run inline automatically.

**Production:**

```bash
npm run build && npm start
```

---

## Simulating webhooks

Create a subscription from the dashboard, copy its **ingest key** and **source**, then run from the project root (with the API already up):

**macOS / Linux**

```bash
# Key only
export WEBHOOK_INGEST_KEY='paste-ingest-key-here'
export WEBHOOK_SOURCE='my-source'
npm run simulate-webhooks

# With HMAC signing enabled
export WEBHOOK_INGEST_KEY='paste-ingest-key-here'
export WEBHOOK_SIGNING_SECRET='paste-signing-secret-hex-here'
export WEBHOOK_SOURCE='my-source'
npm run simulate-webhooks
```

**Windows (PowerShell)**

```powershell
# Key only
$env:WEBHOOK_INGEST_KEY = 'paste-ingest-key-here'
$env:WEBHOOK_SOURCE = 'my-source'
npm run simulate-webhooks

# With HMAC signing enabled
$env:WEBHOOK_INGEST_KEY = 'paste-ingest-key-here'
$env:WEBHOOK_SIGNING_SECRET = 'paste-signing-secret-hex-here'
$env:WEBHOOK_SOURCE = 'my-source'
npm run simulate-webhooks
```
---

## How it works

**Inbound:** `POST /api/webhooks/events` validates the ingest key and optional HMAC signature → enqueues or inline-processes the job → persists a `WebhookEvent` → queues an outbound POST if a callback URL is set.

**Outbound:** A background timer runs `processDueDeliveries` on an interval — POSTs the event envelope to the callback URL with exponential backoff and configurable retries.

---

## What's implemented

| Feature | Details |
|---|---|
| **Subscribe** | `POST /api/webhooks/subscriptions` (JWT) — returns an ingest key |
| **List subscriptions** | `GET /api/webhooks/subscriptions` (JWT) |
| **Ingest events** | `POST /api/webhooks/events` — key or HMAC auth; persists payload; triggers outbound delivery |
| **Retry delivery** | Background timer with backoff via `deliveryService` |
| **Cancel subscription** | Deactivate by source (JWT) |
| **JWT auth** | Register / login at `/api/auth`; Bearer on all management routes |
| **Signing** | Optional per-subscription HMAC-SHA256 (`X-Webhook-Signature`) |
| **Message broker** | RabbitMQ via `RABBITMQ_URL`; inline fallback if unavailable |
| **Event typing** | `processEventByType` tags events by type |
| **Validation** | Zod schemas; structured error middleware |
| **API docs** | Swagger UI at `/api/swagger` |

---

## Project structure

```
src/
├── controllers/        # Thin route handlers
├── routes/             # Express routers
├── services/
│   ├── auth.service.ts
│   ├── webhooksSubscriptions.service.ts
│   ├── webhooksIngest.service.ts
│   ├── delivery.service.ts
│   ├── brokerService.ts
│   └── processIngestJob.ts
├── lib/
│   └── webhooksHttp.ts # Shared HTTP helpers
├── validation/
│   └── schemas.ts      # Zod schemas
└── index.ts            # App entry — delivery timer, server start
```

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGODB_URI` | No | `mongodb://127.0.0.1:27017/webhooks` | MongoDB connection string |
| `PORT` | No | `4000` | Server port |
| `FRONTEND_ORIGIN` | Yes | — | Allowed CORS origin (e.g. `http://localhost:5173`) |
| `JWT_SECRET` | Yes | — | Secret for signing tokens |
| `RABBITMQ_URL` | No | — | Enables RabbitMQ if set; omit for inline mode |