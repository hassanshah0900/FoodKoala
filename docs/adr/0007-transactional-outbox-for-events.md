# ADR 0007: Events leave through a transactional outbox

- **Status:** accepted
- **Date:** 2026-11-08

## Context

Services publish domain events to Kafka (ADR 0002) about changes they save
in PostgreSQL, e.g. order-service saves an order and announces
`order.placed`. Writing to the database and to Kafka are two systems with no
shared transaction. Publishing after the commit loses the event when the
process dies in between. Publishing before it announces changes that may
then roll back.

## Decision

- A service writes each event to an `outbox` table in its own schema, in the
  same transaction as the change. The row holds the full envelope
  (`contracts/README.md#event-envelope`), the topic and the key.
- A relay inside the service publishes unpublished rows oldest first and sets
  `published_at` only after Kafka acknowledged them (`acks=all`, idempotent
  producer).
- One relay sends at a time: it holds a transaction-scoped advisory lock
  while it sends a batch, so with several replicas events still leave in the
  order they were written. The others skip that round.
- The key is the aggregate id (the order id), so one aggregate's events land
  on one partition and stay in order on each topic.
- Published rows are kept for a few days for debugging, then deleted. Kafka's
  own retention decides how long consumers can replay.

## Consequences

- Delivery is **at least once**: a relay that dies after Kafka acknowledged
  but before marking the rows sends them again. Consumers must be idempotent
  and dedupe on the envelope `id` (also sent as the `event-id` header).
- Events reach Kafka a little after the commit (the poll interval, 500 ms by
  default), not instantly.
- When Kafka is down, the service keeps working and events wait in the outbox;
  readiness does not depend on Kafka.
- Order is per topic. A consumer that reads several topics of one aggregate
  (e.g. `order.placed` and `order.status_changed`) must not assume the topics
  are interleaved in commit order; the `at` / `occurredAt` times tell.
