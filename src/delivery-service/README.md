# delivery-service

**Stack:** Go 1.26 · pgx (PostgreSQL) · goose · franz-go (Kafka) · **Port:** 8081

Riders, their shifts, and getting each order from the restaurant to the door.

- API: [`contracts/openapi/delivery-service.yaml`](../../contracts/openapi/delivery-service.yaml) (gateway: `/api/v1/delivery/...`)
- Reads [`order.placed`](../../contracts/events/order.placed.schema.json) and [`order.status_changed`](../../contracts/events/order.status_changed.schema.json); publishes [`delivery.assigned`](../../contracts/events/delivery.assigned.schema.json), [`delivery.picked_up`](../../contracts/events/delivery.picked_up.schema.json) and [`delivery.delivered`](../../contracts/events/delivery.delivered.schema.json).

## What it does

- **Riders.** A signed-in user applies (`POST /riders`: name, vehicle, city; the phone comes from their login) and an admin approves them. Approved riders go online with their location, keep sending it (`PUT /riders/me/location`; while they carry an order each position is also published as `rider.location`, straight to Kafka rather than through the outbox, for tracking-service), and go offline when not carrying an order. Suspending a rider ends their shift.
- **Deliveries.** `order.placed` creates a delivery (`waiting`). When the restaurant accepts, it starts `searching`. Every few seconds the assigner gives each searching delivery, oldest first, to the nearest approved, online rider who is free, within `MAX_PICKUP_KM` of the restaurant and has sent a location in the last `LOCATION_FRESH_FOR`. Rows are locked with `SKIP LOCKED` and a unique index allows one active delivery per rider, so replicas never double-book.
- **The rider's steps.** `GET /riders/me/delivery` shows the job: pickup, drop-off, the customer's phone and the cash to collect. `POST /deliveries/{id}/pickup` and `/dropoff` publish `delivery.picked_up` and `delivery.delivered`, which order-service applies to the order. `/decline` hands it to someone else; it is never offered to that rider again.
- **Cancellations.** A rejected or cancelled order cancels its delivery and frees the rider. If an admin records pickup or delivery by hand for an order nobody was assigned to, the search stops.
- **Customers** see their order's delivery and rider (name, phone, vehicle, location) at `GET /deliveries/orders/{orderId}`.

Events in are applied once per envelope id; an offset is committed only after its event was applied. A status change that arrives before its `order.placed` (another topic) rewinds just its partition and is retried; one for an order older than 10 minutes without a delivery is skipped. Events out go through an outbox (ADR 0007). `/readyz` checks Postgres and that the consumer runs.

Data lives in the `delivery` Postgres schema; goose keeps its version table there too.

## Run

```bash
cp .env.example .env                 # needs PostgreSQL and Kafka (make infra)
go run ./cmd/server migrate          # apply migrations (a release step)
go run ./cmd/server                  # http://localhost:8081/healthz
```

## Test

```bash
go test ./...                                    # unit tests; integration tests skip
DATABASE_URL=postgres://... go test -p 1 ./...   # also against PostgreSQL (empties the delivery tables)
KAFKA_BROKERS=localhost:9092 DATABASE_URL=... go test -p 1 ./...   # and the consumer against a real broker
```

No local Go? `docker run --rm -v "$PWD:/src" -w /src --network host golang:1.26-alpine go test ./...`

## Changing the schema

Add `migrations/000NN_<change>.sql` with `-- +goose Up` and `-- +goose Down` sections. Never edit a migration that has been merged.
