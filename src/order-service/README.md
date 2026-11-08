# order-service

**Stack:** NestJS 12 · TypeScript · Drizzle (PostgreSQL) · **Port:** 3006

Checkout and the life of an order: placed, accepted, ready, picked up, delivered (or rejected, or cancelled).

- API: [`contracts/openapi/order-service.yaml`](../../contracts/openapi/order-service.yaml) (gateway: `/api/v1/orders/...`)
- Events: [`order.placed`](../../contracts/events/order.placed.schema.json) and [`order.status_changed`](../../contracts/events/order.status_changed.schema.json)
- Every endpoint needs the gateway's [identity headers](../../contracts/README.md#identity-headers) (ADR 0005). Restaurant ownership is checked with restaurant-service ([ADR 0006](../../docs/adr/0006-ownership-checks-ask-the-owning-service.md)).

## What it does

- **Checkout** (`POST /` with an `Idempotency-Key` header). Builds the order from the cart (cart-service, priced by menu-service), the saved address (user-service) and the delivery quote (restaurant-service: accepting orders, delivers there, fee, minimum order, delivery time). Clients never send prices. Retrying with the same key returns the first order. The cart is emptied afterwards. Only cash on delivery for now.
- **Life cycle** (`POST /{id}/status`). The restaurant accepts with a prep time, rejects with a reason, and marks the food ready. The customer can cancel until the restaurant accepts. Admins can reject or cancel (with a reason) and, until delivery-service assigns riders, record pickup and delivery. A change only applies if the order is still in the status it was judged in, so racing changes can't both win.
- **Reading.** Customers list their orders; owners and admins list a restaurant's orders by status (`GET /restaurants/{id}/orders?status=placed,accepted`). An order is visible to its customer, its restaurant's owner and admins; anyone else gets 404.
- **Snapshot.** An order keeps its own copy of lines, prices, address and restaurant name, so later edits elsewhere don't change it. The database checks that totals add up.
- **Events** ([ADR 0007](../../docs/adr/0007-transactional-outbox-for-events.md)). The order, its timeline entry and its event are written in one transaction to `orders.outbox`. A relay in the service publishes the outbox to Kafka oldest first, keyed by order id, and marks rows published once Kafka acknowledged them. Delivery is at least once: consumers dedupe on the envelope id (`event-id` header). Without `KAFKA_BROKERS` the relay is off and events wait. Kafka being down doesn't affect readiness.

Calls to other services fail closed: if one can't answer, the request gets 503 and nothing is written. Money is in paisa; menu prices include sales tax. Data lives in the `orders` Postgres schema; migrations are tracked in `drizzle.order_migrations`.

## Run

```bash
npm install
cp .env.example .env          # needs PostgreSQL and Kafka (make infra), cart-, user- and restaurant-service
npm run build
npm run db:migrate            # apply migrations in ./drizzle
npm run dev                   # http://localhost:3006/healthz
```

## Test

```bash
npm test                      # unit tests, no services needed
npm run test:e2e              # HTTP + database; needs migrated PostgreSQL (other services are faked)
KAFKA_BROKERS=localhost:9092 npm run test:e2e   # also runs the test against a real Kafka broker
npm run typecheck
```

## Changing the schema

Edit `src/db/schema.ts`, then `npm run db:generate -- --name <change>` and commit the new folder in `drizzle/`. Never edit a migration that has been merged.
