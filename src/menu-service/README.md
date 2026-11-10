# menu-service

**Stack:** NestJS 12 · TypeScript · Drizzle (PostgreSQL) · **Port:** 3004

Restaurant menus (categories, items, sizes and add-ons, sold-out flags) and the server-side pricing of order lines.

- API: [`contracts/openapi/menu-service.yaml`](../../contracts/openapi/menu-service.yaml) (gateway: `/api/v1/menus/...`, a public prefix)
- Callers are identified by the gateway's [identity headers](../../contracts/README.md#identity-headers) (ADR 0005). Reading menus and pricing are public; changes need the restaurant's owner or an admin, which menu-service checks with restaurant-service ([ADR 0006](../../docs/adr/0006-ownership-checks-ask-the-owning-service.md)).

## What it does

- `GET /restaurants/{id}` returns the menu in display order, sold-out items included (`isAvailable: false`).
- Owners add categories (up to 50) and items (up to 300 per restaurant), reorder them, move items between categories and mark items or single options sold out.
- **Choices** are option groups on an item: a size is `minSelect: 1, maxSelect: 1`, extras are e.g. `0` to `2`. Saved options get ids; sending an id back keeps it, so carts referencing it stay valid.
- **Pricing.** `POST /restaurants/{id}/price` checks order lines against the menu (item on this menu and available, choices valid and available, group limits) and returns unit prices, line totals and the subtotal. It is the only place prices are computed; cart and order services call it and never trust client prices. Problems come back as 422 with one message per problem.

- **Events.** Every menu change writes [`menu.updated`](../../contracts/events/menu.updated.schema.json) to `menu.outbox` in the same transaction: the whole menu (without option groups) and a `revision` that grows per change ([state events](../../contracts/README.md#event-envelope)). A relay publishes the outbox to Kafka when `KAFKA_BROKERS` is set. search-service indexes dishes from these; `npm run events:backfill` republishes every menu for a new consumer.

Money is in paisa. Data lives in the `menu` Postgres schema (`categories`, `items`, `menus` for revisions, `outbox`); migrations are tracked in `drizzle.menu_migrations`.

## Run

```bash
npm install
cp .env.example .env          # needs PostgreSQL (make infra) and restaurant-service for changes
npm run build
npm run db:migrate            # apply migrations in ./drizzle
npm run dev                   # http://localhost:3004/healthz
```

## Test

```bash
npm test                      # unit tests, no services needed
npm run test:e2e              # HTTP + database; needs migrated PostgreSQL (restaurant-service is faked)
npm run typecheck
```

## Changing the schema

Edit `src/db/schema.ts`, then `npm run db:generate -- --name <change>` and commit the new folder in `drizzle/`. Never edit a migration that has been merged.
