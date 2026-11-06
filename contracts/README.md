# Contracts

The source of truth for how services talk to each other. Change the contract
first, then the code.

- `openapi/<service>.yaml`: REST API of each service (OpenAPI 3.1)
- `events/<EventName>.schema.json`: Kafka event payloads (JSON Schema)

## Event envelope

Every event on Kafka uses this envelope; `data` follows the event's schema.

```json
{
  "id": "uuid",
  "type": "order.placed",
  "version": 1,
  "occurredAt": "2026-11-06T12:00:00Z",
  "source": "order-service",
  "data": {}
}
```

Topic naming: `<domain>.<event>`, e.g. `order.placed`, `payment.completed`.
