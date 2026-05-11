# Spezia — backend

Webhook ingest API: subscriptions, signed delivery, event feed (HTTP + SSE), JWT auth.

## Requirements

- Node 18+
- MongoDB
- Optional: RabbitMQ (`RABBITMQ_URL`) for queued ingest

## Setup

```bash
npm install
```

Create a `.env` file with at least `MONGODB_URI` and `JWT_SECRET` (see table below).

**Environment (typical)**

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | e.g. `mongodb://127.0.0.1:27017/spezia` |
| `JWT_SECRET` | Secret for signing auth tokens |
| `RABBITMQ_URL` | Optional; e.g. `amqp://spezia:spezia@127.0.0.1:5672` |
| `PORT` | Server port (default `4000`) |

## Docker (Mongo + RabbitMQ)

From this directory:

```bash
docker compose up -d
```

## Run

```bash
npm run dev      # watch mode
npm run build && npm start
npm test
```

## Scripts

See [`scripts/README.md`](scripts/README.md) for `simulate-webhooks` (sample ingest traffic).

## API

OpenAPI spec: `src/openapi/openapi.json`.
