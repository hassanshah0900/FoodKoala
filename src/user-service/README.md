# user-service

**Stack:** NestJS 12 · TypeScript · Drizzle (PostgreSQL) · **Port:** 3002

The signed-in user's profile, saved delivery addresses (lat/lng plus landmark notes) and favourite restaurants.

- API: [`contracts/openapi/user-service.yaml`](../../contracts/openapi/user-service.yaml) (gateway: `/api/v1/users/...`)
- Callers are identified by the gateway's [identity headers](../../contracts/README.md#identity-headers) (ADR 0005); requests without them get 401.

## What it does

- `GET /me` returns the profile, creating it on first access from `X-User-Id` and `X-User-Phone`. `PATCH /me` changes name, email or language (`en`/`ur`).
- `/me/addresses` saves up to 10 addresses: label (home/work/other), line1, area, city, an optional landmark and rider instructions, and a map pin that must be inside Pakistan.
- There is always exactly one default address: the first one, or whichever was last marked `isDefault`. Deleting the default promotes the newest remaining one. A partial unique index enforces this in the database too.
- `/me/favourites` stars up to 100 restaurants. `PUT` and `DELETE /me/favourites/{restaurantId}` are idempotent. Only restaurants that restaurant-service lists to customers can be added, which user-service checks by asking anonymously. `GET` returns them newest first, each with the restaurant as customers see it (open now, paused), or `restaurant: null` while it isn't listed. If restaurant-service can't answer, adding and listing get 503.

Data lives in the `users` Postgres schema (`profiles`, `addresses`, `favourite_restaurants`); migrations are tracked in `drizzle.users_migrations`.

## Run

```bash
npm install
cp .env.example .env          # needs PostgreSQL (make infra)
npm run build
npm run db:migrate            # apply migrations in ./drizzle
npm run dev                   # http://localhost:3002/healthz
```

Called directly (not through the gateway), send the identity headers yourself:

```bash
curl localhost:3002/me -H 'X-User-Id: 7d3c8f8e-3a0e-4c55-9a6b-3f1c2b8a9d10' -H 'X-User-Phone: +923001234567'
```

## Test

```bash
npm test                      # unit tests, no services needed
npm run test:e2e              # HTTP + database behaviour; needs migrated PostgreSQL
npm run typecheck
```

## Changing the schema

Edit `src/db/schema.ts`, then `npm run db:generate -- --name <change>` and commit the new folder in `drizzle/`. Never edit a migration that has been merged.
