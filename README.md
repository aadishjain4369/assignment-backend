# Webhook platform — backend

This is an Express.js backend written in TypeScript that handles webhook subscriptions, authentication for dashboard routes, receiving and storing incoming events, maintaining a full event history, and automatically retrying any failed outbound webhooks to user-specified callback URLs. Subscriptions and events are saved in MongoDB. For asynchronous event handling and better scalability, RabbitMQ can be enabled, but using it is optional.

---

## How this maps to the assignment

| Requirement | What we implemented |
|-------------|---------------------|
| Node HTTP server | **Express** (`createApp`, routers under **`routes/`**, **`controllers/`** handlers). |
| Subscribe | **`POST /api/webhooks/subscriptions`** (JWT): **`webhooksSubscriptions.service`** upserts by **source**, optional **callback URL**, optional inbound signing; returns **ingest key**. |
| List subscriptions | **`GET /api/webhooks/subscriptions`** (JWT). |
| Incoming events | **`POST /api/webhooks/events`**: **`webhooksIngest.service`** **`handleIncomingEvent`** — ingest key / optional HMAC; **`publishWebhookJob`**; persists **`WebhookEvent`**; queues outbound POST when **callback URL** is set. |
| Database | **MongoDB** + Mongoose — **`WebhookSubscription`**, **`WebhookEvent`**. |
| JWT auth | **`/api/auth/register`**, **`/api/auth/login`**; **`authMiddleware`** secures webhook dashboard routes (**Bearer**). SSE uses **query token** because browsers cannot send headers on **`EventSource`**. |
| Process & store events | **`webhooksIngest.service`** (**`processEventByType`**), **`processIngestJob`** — classify/tag by event **`type`**, save normalized record linked to **userId**. |
| Validation & errors | **Zod** schemas (**`validation/schemas.ts`**); consistent JSON errors via **`errorMiddleware`** / service **`Fail`** types. |
| Retry failed deliveries | **`deliveryService`** tracks attempts **`processDueDeliveries`** interval + backoff scheduling from **`index.ts`**. |
| Cancel subscription | **`DELETE`** / deactivate endpoint pattern (**cancel** by source, JWT) — subscription marked inactive. |
| Webhook simulation | **`npm run simulate-webhooks`** — Node script POSTing sample payloads; documented in **`scripts/README.md`**. |
| Bonus: filtering / typing | **`processEventByType`** tags domains (billing, risk, inventory) from **`type`**. |
| Bonus: signing | Optional **HMAC-SHA256** on raw JSON body (**`X-Webhook-Signature`**) when enabled per subscription. |
| Bonus: message broker | **RabbitMQ** via **`RABBITMQ_URL`**; **`publishWebhookJob`** → queue + consumer, **inline fallback** if broker absent or down. |
| API documentation | **Swagger UI** at **`GET /api/swagger`** — e.g. **`http://localhost:4000/api/swagger`**. |

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

Health check: **`GET /health`**.

### Swagger docs

With the server running: **`http://localhost:4000/api/swagger`** (change host/port if **`PORT`** is not **4000**).

---

## Webhook simulation & manual testing

1. In the dashboard, subscribe once for the **source** you want (e.g. `my-source`), then **copy the ingest key** for that row.
2. Change to the backend package: **`cd assignment-backend`** from the monorepo root (skip if your shell is already the backend repo root). Then run the simulator. **`WEBHOOK_SOURCE`** must match that subscription’s source.

**Ingest key only** (signing off):

```bash
cd assignment-backend   # from monorepo root; omit if you’re already in this directory
export WEBHOOK_INGEST_KEY='paste-ingest-key-here'
export WEBHOOK_SOURCE='my-source'
npm run simulate-webhooks
```

**Signing enabled** (paste the **signing secret** from the modal when you enabled signing—and keep **`WEBHOOK_SOURCE`** aligned with that subscription):

```bash
cd assignment-backend   # from monorepo root; omit if you’re already in this directory
export WEBHOOK_INGEST_KEY='paste-ingest-key-here'
export WEBHOOK_SIGNING_SECRET='paste-signing-secret-hex-here'
export WEBHOOK_SOURCE='my-source'
npm run simulate-webhooks
```


---

## API surface (summary)

Details for each endpoint are in **Swagger** (**`/api/swagger`** above).

- **`/api/auth`** — register, login → JWT.
- **`/api/webhooks`** — subscriptions (create/list/cancel), signing rotation, **feed** query, **SSE stream**, inbound **`.../events`**.

Ingest authentication uses the **per-subscription ingest key**, not the user JWT (external systems use the key; the dashboard uses JWT to manage subscriptions).

---

## Architecture notes

**Flow — inbound:** HTTP **`POST /events`** → validate key/signature → **`publishWebhookJob`** (queue or inline) → **`processQueuedWebhook`** → persist **`WebhookEvent`** → enqueue outbound delivery if **`callbackUrl`** is set.

**Flow — outbound:** Worker/timer picks due deliveries → **`fetch`** POST with envelope → on failure, schedule **retry** per **`deliveryService`** rules.

**Code layout:** Thin **`controllers`** + **`routes`**; **`services`** (**`webhooksSubscriptions.service`**, **`webhooksIngest.service`**, **`authService`**, **`deliveryService`**, **`brokerService`**, **`processIngestJob`**); HTTP helpers in **`lib/webhooksHttp.ts`**.

**Security:** Rate limiting on ingest; JWT for management APIs; optional inbound HMAC; CORS restricted to **`FRONTEND_ORIGIN`**.

---

## Frontend

Run the companion SPA with **`VITE_API_URL`** pointing here (default **`http://localhost:4000`**) and **`FRONTEND_ORIGIN`** matching the Vite origin.
