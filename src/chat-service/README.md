# chat-service

**Stack:** Go 1.26 · MongoDB · go-redis · franz-go (Kafka) · coder/websocket · minio-go (S3) · **Port:** 8083

The customer and the rider bringing their order talk: text, photos and read receipts, live.

- API: [`contracts/openapi/chat-service.yaml`](../../contracts/openapi/chat-service.yaml) (gateway: `/api/v1/chat/...`)
- Reads [`delivery.assigned`](../../contracts/events/delivery.assigned.schema.json), [`delivery.delivered`](../../contracts/events/delivery.delivered.schema.json) and [`order.status_changed`](../../contracts/events/order.status_changed.schema.json). Publishes nothing.
- Why MongoDB and S3: [ADR 0008](../../docs/adr/0008-chat-in-mongodb-photos-in-s3.md).

## What it does

- **Who may talk, from events.** `delivery.assigned` opens the order's chat between its customer and rider (the event carries both). A newer assignment hands the chat to the new rider, and the old one loses it. `delivery.delivered`, or the order rejected, cancelled or delivered, closes it an hour later. Events come from several topics in any order and may repeat, so each is a conditional upsert: an assignment only if newer and the chat isn't closed, a closing only once. A chat closed before any rider was assigned never opens.
- **Who sees what.** The customer and the current rider read and write. Admins read along but can't write. Anyone else gets 404.
- **Messages** carry a `clientId` chosen by the app. A unique index on (order, sender, clientId) turns a retried send into the first message (200 instead of 201).
- **Photos** (JPEG, PNG or WebP up to 5 MB, checked by their first bytes, not their name) go to a private bucket under `chats/<orderId>/<photoId>`. They are served only through `GET /orders/{orderId}/photos/{photoId}` after the same check as the chat. Without `S3_ENDPOINT` photos are off (503).
- **Read receipts.** `POST /orders/{orderId}/read`, or sending a message, moves your read mark forward (`$max`, never back). The other side sees it.
- **Live.** `GET /orders/{orderId}/live` is a WebSocket (subprotocol `foodkoala.chat.v1`):
  - it sends a `snapshot` first, then each `message` and `read`;
  - events cross replicas on the Redis channel `chat:live:<orderId>`, through one shared subscription per replica;
  - unlike tracking, no message may be skipped. A socket that falls 32 events behind, hears `changed` (handover, closing), or resyncs every 30 s while something changed gets a fresh `snapshot` instead;
  - a rider who lost the chat is disconnected with 1008.

## Run

```bash
cp .env.example .env     # needs MongoDB, Redis, Kafka and the S3 storage (make infra)
go run ./cmd/server      # http://localhost:8083/healthz
```

## Test

```bash
go test ./...            # unit tests; integration tests skip without their variables
MONGO_URL=mongodb://localhost:27017 REDIS_URL=redis://localhost:6379 \
S3_ENDPOINT=localhost:8333 S3_ACCESS_KEY=foodkoala S3_SECRET_KEY=foodkoala-secret go test ./...
```

No local Go? `docker run --rm --network host -v "$PWD:/src" -w /src golang:1.26 go test ./...` (with the variables as `-e`).

## Layout

```
cmd/server/          entrypoint: API, consumer, Redis hub; `healthcheck` subcommand
internal/chat/       pure: who may do what, reading events, message rules
internal/service/    what the service does, over a store, photo storage and live announcements
internal/store/      MongoDB: chats, messages, indexes
internal/live/       Redis pub/sub: announcing, and the shared subscription (Hub)
internal/photos/     S3 bucket
internal/consumer/   Kafka consumer group, commit after apply
internal/api/        HTTP and WebSocket handlers
internal/testenv/    in-memory stand-ins and integration-test connections
```
