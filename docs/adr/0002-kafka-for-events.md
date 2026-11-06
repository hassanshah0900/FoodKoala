# ADR 0002: Kafka for domain events

- **Status:** accepted
- **Date:** 2026-11-06

## Decision

Use Kafka (KRaft mode, no ZooKeeper) for asynchronous domain events such as
`OrderPlaced`, `PaymentCompleted`, `RiderAssigned` and `OrderDelivered`.

## Why

Events are replayable, multiple consumers (notification, analytics, tracking)
can read the same stream independently, and per-order partitioning keeps
events for one order in sequence.

## Consequences

Heavier to run locally than RabbitMQ; a single-node broker is used in
`deploy/compose/infra.yml`.
