# restaurant-service

**Stack:** NestJS 12 · TypeScript · Drizzle (PostgreSQL + PostGIS) · **Port:** 3003

Restaurant onboarding and review, opening hours, delivery zones and province (used for sales tax).

- API: [`contracts/openapi/restaurant-service.yaml`](../../contracts/openapi/restaurant-service.yaml) (gateway: `/api/v1/restaurants/...`, a public prefix)
- Callers are identified by the gateway's [identity headers](../../contracts/README.md#identity-headers) (ADR 0005). Browsing works without them; managing a restaurant needs them; review needs the `admin` role.

## What it does

- **Onboarding.** Any signed-in user applies with `POST /` and owns the restaurant. It starts `pending`; an admin approves it (only once it has opening hours and a delivery zone) or rejects it with a reason. The owner can fix and resubmit a rejected one. Admins can suspend and reinstate. Customers only ever see approved restaurants.
- **Opening hours** in Asia/Karachi time: up to three ranges a day, ranges past midnight (`18:00`–`02:00`), and special hours such as Ramadan or Eid that replace the weekly hours for up to 60 days. `PUT /{id}/pause` stops orders for 5 minutes to a day when the kitchen is busy.
- **Delivery zones** are GeoJSON polygons drawn on the map, each with its own delivery fee, minimum order and delivery time (up to 10 per restaurant). PostGIS rejects outlines that cross themselves.
- **Browsing.** `GET /?lat=&lng=` lists approved restaurants with a zone containing the point, nearest first; when zones overlap, the cheapest fee applies. `GET /{id}/delivery-quote?lat=&lng=` answers "do you deliver here, and for how much" for checkout and order-service.

- **Events.** Every change to a restaurant, its hours or its zones writes [`restaurant.updated`](../../contracts/events/restaurant.updated.schema.json) to `restaurants.outbox` in the same transaction: the whole public restaurant with its zones and a `revision` that grows per change ([state events](../../contracts/README.md#event-envelope)). A relay publishes the outbox to Kafka when `KAFKA_BROKERS` is set. search-service builds its index from these; `npm run events:backfill` republishes every restaurant for a new consumer.

Money is in paisa (`deliveryFeePaisa: 9900` is Rs 99). Data lives in the `restaurants` Postgres schema (`restaurants`, `delivery_zones` with a GiST index, `outbox`); migrations are tracked in `drizzle.restaurants_migrations`.

## Run

```bash
npm install
cp .env.example .env          # needs PostgreSQL with PostGIS (make infra)
npm run build
npm run db:migrate            # apply migrations in ./drizzle (enables PostGIS if missing)
npm run dev                   # http://localhost:3003/healthz
```

Called directly (not through the gateway), send the identity headers yourself:

```bash
curl localhost:3003/mine -H 'X-User-Id: 7d3c8f8e-3a0e-4c55-9a6b-3f1c2b8a9d10' -H 'X-User-Phone: +923001234567'
curl 'localhost:3003/?lat=24.92&lng=67.09'
```

## Test

```bash
npm test                      # unit tests, no services needed
npm run test:e2e              # HTTP + database behaviour; needs migrated PostgreSQL with PostGIS
npm run typecheck
```

## Changing the schema

Edit `src/db/schema.ts`, then `npm run db:generate -- --name <change>` and commit the new folder in `drizzle/`. Never edit a migration that has been merged.
