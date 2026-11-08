# notification-service

**Stack:** NestJS 12 · TypeScript · Drizzle (PostgreSQL) · Kafka · **Port:** 3007

Tells customers what is happening with their orders: an in-app inbox, and SMS for the updates that matter.

- API: [`contracts/openapi/notification-service.yaml`](../../contracts/openapi/notification-service.yaml) (gateway: `/api/v1/notifications/...`)
- Reads [`order.placed`](../../contracts/events/order.placed.schema.json) and [`order.status_changed`](../../contracts/events/order.status_changed.schema.json) from Kafka.

## What it does

- **Inbox.** One entry per order event, with a title, a body and the order id to link to. `GET /` lists them newest first with the unread count; `POST /{id}/read` and `POST /read-all` mark them read.
- **SMS** for: accepted (with the expected time, Pakistan time), on its way, rejected, cancelled by the restaurant or support. Placed, ready, delivered and the customer's own cancellation stay in the inbox only.
- **At least once, never twice** ([ADR 0007](../../docs/adr/0007-transactional-outbox-for-events.md)). The inbox entry and its queued SMS are written in one transaction, unique per event id, and the Kafka offset is committed after that, so a replay adds nothing. A malformed event is logged and skipped. While Postgres is down the same event is retried.
- **Sending.** A loop claims due texts with `for update skip locked` (replicas never send the same one), and retries failures after 30 s, 1 min, 2 min... up to `SMS_MAX_ATTEMPTS`. A permanent provider error (e.g. invalid number) fails at once. A crash right after the provider accepted a text but before it is marked sent can send it again; that is the only duplicate possible.
- **Providers.** `SMS_PROVIDER=log` prints texts (development only; refused in production). `twilio` sends through Twilio's Messages API, from a number or a Messaging Service.

`/readyz` checks Postgres and, when Kafka is configured, that the consumer is running. Data lives in the `notifications` Postgres schema; migrations are tracked in `drizzle.notification_migrations`.

## Run

```bash
npm install
cp .env.example .env          # needs PostgreSQL and Kafka (make infra)
npm run build
npm run db:migrate            # apply migrations in ./drizzle
npm run dev                   # http://localhost:3007/healthz
```

## Test

```bash
npm test                      # unit tests, no services needed (Twilio is faked)
npm run test:e2e              # needs migrated PostgreSQL; Kafka and the SMS provider are faked
npm run typecheck
```

## Changing the schema

Edit `src/db/schema.ts`, then `npm run db:generate -- --name <change>` and commit the new folder in `drizzle/`. Never edit a migration that has been merged.
