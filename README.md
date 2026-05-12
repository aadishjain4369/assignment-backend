# Webhook platform — backend

Express.js + TypeScript API for **webhook subscriptions**, **authenticated dashboard routes**, **inbound event ingest**, **persisted event history**, and **retrying outbound deliveries** to subscriber callback URLs. MongoDB stores subscriptions and events; RabbitMQ is **optional** for asynchronous ingest processing.

---

## How this maps to the assignment

| Requirement | What we implemented |
|-------------|---------------------|
| Node HTTP server | **Express** (`createApp`, routers under **`routes/`**, **`controllers/`** handlers). |
| Subscribe | **`POST /api/webhooks/subscriptions`** (JWT): upserts by **source** (logical sender label), optional **callback URL**, optional inbound signing; returns **ingest key** used when posting events. |
| List subscriptions | **`GET /api/webhooks/subscriptions`** (JWT). |
| Incoming events | **`POST /api/webhooks/events`**: resolves subscription via **`X-Ingest-Key`** or JSON **`ingestKey`**; validates payload (Zod); queues or processes job; persists **`WebhookEvent`**; queues outbound POST to **callback URL** when set. |
| Database | **MongoDB** + Mongoose — **`WebhookSubscription`**, **`WebhookEvent`**. |
| JWT auth | **`/api/auth/register`**, **`/api/auth/login`**; **`authMiddleware`** secures webhook dashboard routes (**Bearer**). SSE uses **query token** because browsers cannot send headers on **`EventSource`**. |
| Process & store events | **`webhooks.service`**, **`processIngestJob`** — classify/tag by event **`type`**, save normalized record linked to **userId**. |
| Validation & errors | **Zod** schemas (**`validation/schemas.ts`**); consistent JSON errors via **`errorMiddleware`** / service **`Fail`** types. |
| Retry failed deliveries | **`deliveryService`** tracks attempts **`processDueDeliveries`** interval + backoff scheduling from **`index.ts`**. |
| Cancel subscription | **`DELETE`** / deactivate endpoint pattern (**cancel** by source, JWT) — subscription marked inactive. |
| Webhook simulation | **`npm run simulate-webhooks`** — Node script POSTing sample payloads; documented in **`scripts/README.md`**. |
| Bonus: filtering / typing | **`processEventByType`** tags domains (billing, risk, inventory) from **`type`**. |
| Bonus: signing | Optional **HMAC-SHA256** on raw JSON body (**`X-Webhook-Signature`**) when enabled per subscription. |
| Bonus: message broker | **RabbitMQ** via **`RABBITMQ_URL`**; **`publishWebhookJob`** → queue + consumer, **inline fallback** if broker absent or down. |

---

## Requirements

- **Node.js** 18+
- **MongoDB**
- **Optional:** **RabbitMQ** (`RABBITMQ_URL`) — see **`docker-compose.yml`**

---

## Local setup

### 1. Install

```bash
npm install
```

### 2. Environment

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | **Yes** | Signs JWTs for `/api/auth` and protected webhook routes. |
| `MONGODB_URI` | No* | Default: `mongodb://127.0.0.1:27017/webhooks`. |
| `PORT` | No | Default **4000** (matches frontend default API base URL). |
| `FRONTEND_ORIGIN` | No | CORS for SPA; default `http://localhost:5173`. |
| `RABBITMQ_URL` | No | If set, ingest jobs go through the queue; otherwise processed immediately. |
| `JWT_EXPIRES_IN` | No | e.g. `8h`. |
| `JSON_BODY_LIMIT` | No | Default `256kb`; **`rawBody`** kept for signature verification. |

\*MongoDB must be reachable.

### 3. Infrastructure (optional)

```bash
docker compose up -d
```

RabbitMQ management UI is commonly at **`http://localhost:15672`** (credentials in **`docker-compose.yml`**).

### 4. Run

```bash
npm run dev
# or
npm run build && npm start
```

- Health: **`GET /health`**
- OpenAPI JSON: **`GET /openapi.json`**

---

## Webhook simulation & manual testing

Use **`npm run simulate-webhooks`** from this directory to register/login a test user, ensure a subscription exists, and POST batched sample events to **`POST /api/webhooks/events`**. Configure **`WEBHOOK_INGEST_KEY`**, **`WEBHOOK_SIGNING_SECRET`**, **`WEBHOOK_URL`**, etc. per **`scripts/README.md`**.

You can also call **`POST /api/webhooks/events`** from Postman or curl with **`X-Ingest-Key`** (and signature headers when signing is on).

---

## API surface (summary)

- **`/api/auth`** — register, login → JWT.
- **`/api/webhooks`** — subscriptions (create/list/cancel), signing rotation, **feed** query, **SSE stream**, inbound **`.../events`**.

Ingest authentication uses the **per-subscription ingest key**, not the user JWT (external systems use the key; the dashboard uses JWT to manage subscriptions).

---

## Architecture notes

**Flow — inbound:** HTTP **`POST /events`** → validate key/signature → **`publishWebhookJob`** (queue or inline) → **`processQueuedWebhook`** → persist **`WebhookEvent`** → enqueue outbound delivery if **`callbackUrl`** is set.

**Flow — outbound:** Worker/timer picks due deliveries → **`fetch`** POST with envelope → on failure, schedule **retry** per **`deliveryService`** rules.

**Code layout:** Thin **`controllers`** + **`routes`**; **`services`** (**`webhooks.service`**, **`authService`**, **`deliveryService`**, **`brokerService`**, **`processIngestJob`**); HTTP helpers in **`lib/webhooksHttp.ts`**.

**Security:** Rate limiting on ingest; JWT for management APIs; optional inbound HMAC; CORS restricted to **`FRONTEND_ORIGIN`**.

---

## Frontend

Run the companion SPA with **`VITE_API_URL`** pointing here (default **`http://localhost:4000`**) and **`FRONTEND_ORIGIN`** matching the Vite origin.
