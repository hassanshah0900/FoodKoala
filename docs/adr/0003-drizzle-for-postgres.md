# ADR 0003: Drizzle ORM for PostgreSQL in NestJS services

- **Status:** accepted
- **Date:** 2026-11-07

## Context

Several NestJS services (`auth`, `user`, `restaurant`, `menu`, `order`) store
data in PostgreSQL, and `restaurant-service` needs PostGIS. They should use one
database layer so patterns, migrations and tests look the same everywhere.

## Decision

Use [Drizzle ORM](https://orm.drizzle.team/) with the `node-postgres` driver,
registered through Nest's first-party `@nestjs/drizzle` module.

- The schema is TypeScript in `src/db/schema.ts`; Drizzle Kit generates SQL
  migrations into `drizzle/`, which are committed.
- Each service owns a **PostgreSQL schema** named after it (e.g. `auth`) in
  the shared database, and never reads another service's schema.
- Migrations run as an explicit step (`npm run db:migrate`), not on app
  startup, so several replicas never race to migrate.

## Consequences

Queries are typed and close to SQL, and raw SQL (e.g. PostGIS functions) stays
easy. There is no repository layer or lazy loading; services write small
repository providers where useful. Drizzle 1.0 is still a release candidate,
so versions are pinned exactly.
