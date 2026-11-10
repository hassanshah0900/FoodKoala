# tracking-service

**Stack:** Go 1.26 · go-redis · franz-go (Kafka) · coder/websocket · **Port:** 8082

Where the rider is, live, and when the food should arrive.

- API: [`contracts/openapi/tracking-service.yaml`](../../contracts/openapi/tracking-service.yaml) (gateway: `/api/v1/tracking/...`)
- Reads [`order.placed`](../../contracts/events/order.placed.schema.json), [`order.status_changed`](../../contracts/events/order.status_changed.schema.json), [`delivery.assigned`](../../contracts/events/delivery.assigned.schema.json), [`delivery.picked_up`](../../contracts/events/delivery.picked_up.schema.json), [`delivery.delivered`](../../contracts/events/delivery.delivered.schema.json) and [`rider.location`](../../contracts/events/rider.location.schema.json). Publishes nothing.

## What it does

- **Follows each order from its events.** `order.placed` gives the customer, the restaurant and the door; `delivery.assigned` the rider; the rider's steps move it from `waiting_for_rider` to `to_restaurant`, `to_customer` and `delivered`; a rejected or cancelled order ends as `cancelled`. Events come from several topics in any order, so each one fills what it knows and nothing moves backwards. A newer `delivery.assigned` replaces the rider and forgets the old rider's position. Pings older than the last one, or from a rider who no longer has the order, are ignored.
- **Arrival time** is worked out on every position: the straight line still to ride (to the restaurant and on to the door before pickup, to the door after), times 1.35 for the roads, at 25 km/h on a motorbike, 20 by car or 12 by bicycle.
- **Live.** `GET /orders/{orderId}` is the current tracking; `GET /orders/{orderId}/live` is a WebSocket (subprotocol `foodkoala.tracking.v1`) that sends it at once and again on every change, and closes after the final message. Through api-gateway browsers send their token as the subprotocol `bearer.<token>`. The customer, the rider carrying it and admins can see an order; anyone else gets 404.

Tracking lives in Redis (`tracking:order:<id>`, a day while under way, two hours once finished). Events are applied with an optimistic transaction (WATCH/MULTI), since one order's topics may be read by different replicas at once. Each saved change is published on `tracking:live:<id>` in the same transaction. Every replica shares one Redis subscription among its sockets, so a socket on any replica hears changes applied on any other. Sockets also re-read every 10 s, in case a message was lost while Redis reconnected. A repeated event changes nothing. Offsets are committed after the event is applied; a failure (Redis down) rewinds only its partition, and malformed events are logged and skipped. `/readyz` checks Redis and that the consumer runs.

## Run

```bash
cp .env.example .env                 # needs Redis and Kafka (make infra)
go run ./cmd/server                  # http://localhost:8082/healthz
```

## Test

```bash
go test ./...                                                   # unit tests; integration tests skip
REDIS_URL=redis://localhost:6379 go test ./...                  # also the store and the WebSocket against Redis
KAFKA_BROKERS=localhost:9092 REDIS_URL=redis://... go test ./...   # and the consumer against a real broker
```

No local Go? `docker run --rm -v "$PWD:/src" -w /src --network host golang:1.26-alpine go test ./...`

## Layout

```
cmd/server/          entrypoint: API, consumer, Redis hub; `healthcheck` subcommand
internal/tracking/   pure: folding events into a State, arrival time
internal/store/      Redis: optimistic updates, publishing, the shared subscription (Hub)
internal/consumer/   Kafka consumer group, commit after apply
internal/api/        HTTP and WebSocket handlers
```
