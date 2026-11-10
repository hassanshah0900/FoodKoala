# auth-service

**Stack:** NestJS 12 · TypeScript · Drizzle (PostgreSQL) · Redis · **Port:** 3001

Phone number (+92) and OTP login, JWT issuing and refresh, roles (customer, vendor, rider, admin).

- API: [`contracts/openapi/auth-service.yaml`](../../contracts/openapi/auth-service.yaml)
- Decisions: [ADR 0003 (Drizzle)](../../docs/adr/0003-drizzle-for-postgres.md), [ADR 0004 (RS256 + JWKS)](../../docs/adr/0004-rs256-jwt-with-jwks.md)

## How login works

1. `POST /otp/request {phone}` sends a 6-digit code. It is stored in Redis only as an
   HMAC (`OTP_PEPPER`), expires in 5 minutes, and can be resent after 60 seconds
   (at most 5 per hour). 429 responses carry `Retry-After`.
2. `POST /otp/verify {phone, code}` consumes the code (5 wrong attempts drop it),
   creates the user as `customer` on first login, and returns an RS256 access
   token (15 min) plus an opaque refresh token (30 days).
3. `POST /token/refresh` rotates the refresh token. Replaying an already used one
   revokes the whole login (token family). `POST /logout` revokes it.
4. Other services verify access tokens with the public keys at
   `GET /.well-known/jwks.json`.

Data lives in the `auth` Postgres schema (`users`, `refresh_tokens`); migrations
are tracked in `drizzle.auth_migrations`.

## Run

```bash
npm install
cp .env.example .env          # needs PostgreSQL and Redis (make infra)
npm run build
npm run db:migrate            # apply migrations in ./drizzle
npm run dev                   # http://localhost:3001/healthz
```

In development `SMS_PROVIDER=log`, so the login code is printed in the log. For real texts set `SMS_PROVIDER=twilio` with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` (a sender number or a Messaging Service). If a text can't be sent the request gets 503 and the user can ask again at once; the hourly limit still counts it.

**Admins.** Every user starts as a customer. Numbers listed in `ADMIN_PHONES`
(comma-separated, any Pakistani format) get the `admin` role the next time
they sign in. That is how the first admin is made; taking a number out of the
list does not take the role back.

## Test

```bash
npm test                      # unit tests, no services needed
npm run test:e2e              # full HTTP flow; needs migrated PostgreSQL + Redis
                              # (DATABASE_URL / REDIS_URL override the defaults)
npm run typecheck
```

## Changing the schema

Edit `src/db/schema.ts`, then `npm run db:generate -- --name <change>` and commit
the new folder in `drizzle/`. Never edit a migration that has been merged.
