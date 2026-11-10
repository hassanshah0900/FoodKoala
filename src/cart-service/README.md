# cart-service

**Stack:** NestJS 12 · TypeScript · Redis · **Port:** 3005

The signed-in user's cart: one restaurant at a time, priced by menu-service on every read and write.

- API: [`contracts/openapi/cart-service.yaml`](../../contracts/openapi/cart-service.yaml) (gateway: `/api/v1/cart/...`, needs a signed-in user)
- Callers are identified by the gateway's [identity headers](../../contracts/README.md#identity-headers) (ADR 0005).

## What it does

- `POST /items` adds an item with its choices and a kitchen note. A line with the same item, choices and note is merged (quantities add up, at most 50). Items from another restaurant get 409 unless `replace: true` starts a new cart.
- `PATCH /items/{lineId}` changes quantity, choices or note; `DELETE /items/{lineId}` removes a line; `DELETE /` empties the cart.
- **Prices** come from menu-service (`POST /restaurants/{id}/price`), never from the client. A new or changed line is checked first; 422 carries menu-service's reasons (sold out, missing a required choice, ...).
- **Reorder.** `POST /reorder {orderId}` puts a past order's lines back, with their choices and notes, at today's prices, merging like `POST /items`. order-service is asked for the order with the caller's identity, so only their own orders work. Lines the menu can no longer serve (sold out, removed, a choice gone) are left out and listed in `skipped` with menu-service's reason. If nothing can be added, the response is 422 and the cart is untouched.
- When the menu changes after an item was added, `GET /` keeps the line with its last known price and lists it in `problems`; the cart can't be checked out until it's fixed.
- Carts are JSON in Redis (`cart:<userId>`), expiring 7 days after the last change. Writes use an atomic compare-and-set script, so concurrent requests never lose an update.

Money is in paisa.

## Run

```bash
npm install
cp .env.example .env          # needs Redis (make infra) and menu-service
npm run dev                   # http://localhost:3005/healthz
```

## Test

```bash
npm test                      # unit tests, no services needed
npm run test:e2e              # HTTP + Redis; menu-service is replaced by a stand-in
npm run typecheck
```
