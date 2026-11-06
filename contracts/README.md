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

## Identity headers

Requests that `api-gateway` has authenticated reach services with these
headers (ADR 0005). Clients can never set them; the gateway strips them.

| Header | Example | Meaning |
|---|---|---|
| `X-User-Id` | `7d3c8f8e-3a0e-4c55-9a6b-3f1c2b8a9d10` | `sub` of the access token |
| `X-User-Roles` | `customer,vendor` | Comma-separated roles |
| `X-User-Phone` | `+923001234567` | E.164 phone number |

No `X-User-Id` means an anonymous request (only possible on public routes).
The original `Authorization` header is forwarded too.

## Conventions

- **Money** is an integer number of paisa (1 PKR = 100 paisa), in fields
  ending in `Paisa`, e.g. `deliveryFeePaisa: 9900` is Rs 99. Never floats.
- **Locations** are WGS 84: `{ "lat": 24.92, "lng": 67.09 }` in bodies, and
  GeoJSON (`[lng, lat]` order) for shapes such as delivery zones.
- **Local time** (opening hours, schedules) is Pakistan time, Asia/Karachi
  (UTC+5, no daylight saving). Timestamps are ISO 8601 in UTC.
