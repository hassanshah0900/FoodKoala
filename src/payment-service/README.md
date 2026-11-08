# payment-service

**Stack:** FastAPI · Python 3.13 · SQLAlchemy 2 + Alembic (PostgreSQL) · Kafka · [uv](https://docs.astral.sh/uv/) · **Port:** 8001

What each order costs the customer and whether it has been paid. Cash on delivery for now; JazzCash, Easypaisa and cards come later.

- API: [`contracts/openapi/payment-service.yaml`](../../contracts/openapi/payment-service.yaml) (gateway: `/api/v1/payments/...`)
- Reads [`order.placed`](../../contracts/events/order.placed.schema.json) and [`order.status_changed`](../../contracts/events/order.status_changed.schema.json) from Kafka.

## What it does

- **Cash on delivery.** `order.placed` creates a `pending` payment for the order total. Delivery makes it `collected`; rejection or cancellation before that makes it `cancelled`. A settled payment never changes again.
- **Events, at least once** ([ADR 0007](../../docs/adr/0007-transactional-outbox-for-events.md)). The consumer applies each event in one transaction, recording its envelope id in `payments.processed_events`, and commits the Kafka offset only afterwards. A replayed event is a no-op. A status change that arrives before its `order.placed` (they are separate topics) is retried from the same offset until the payment exists. A malformed event is logged and skipped so it can't block its partition. A database outage pauses consumption and retries.
- **Reading.** `GET /orders/{orderId}` for the order's customer and admins; `GET /?status=pending` lists payments for admins (cash still to collect).
- `/readyz` checks PostgreSQL and, when Kafka is configured, that the consumer is running.

Data lives in the `payments` Postgres schema (`payments`, `processed_events`); Alembic tracks migrations in `payments.alembic_version`.

## Run

```bash
uv sync
cp .env.example .env               # needs PostgreSQL and Kafka (make infra)
uv run alembic upgrade head         # apply migrations (a release step, not on startup)
uv run uvicorn app.main:app --reload --port 8001   # http://localhost:8001/healthz
```

## Test

```bash
uv run pytest                       # needs migrated PostgreSQL (DATABASE_URL)
KAFKA_BROKERS=localhost:9092 uv run pytest   # also the consumer against a real broker
uv run ruff check . && uv run ruff format --check .
```

## Changing the schema

Edit `app/models.py`, then `uv run alembic revision --autogenerate --rev-id <next> -m "<change>"`, review the generated file in `migrations/versions/` and commit it. `uv run alembic check` fails when models and migrations disagree. Never edit a migration that has been merged.
