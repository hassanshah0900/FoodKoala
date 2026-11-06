# api-gateway

**Stack:** Go 1.23 (standard library only) · **Port:** 8080

Single entry point for the web app. Routes `/api/v1/<service>/...` to the matching backend service (prefix stripped). Upstream URLs come from `<NAME>_SERVICE_URL` env vars. Rate limiting comes next.

## Authentication

Per [ADR 0005](../../docs/adr/0005-gateway-authenticates-services-authorize.md), the gateway verifies access tokens and services do authorization:

- `Authorization: Bearer <token>` is verified against auth-service's JWKS (`AUTH_JWKS_URL`, cached 5 min, refetched on an unknown `kid`). Only `RS256` is accepted, and `exp`, `nbf`, `iss` and `aud` are checked.
- Valid tokens reach services as `X-User-Id`, `X-User-Roles` and `X-User-Phone` ([contracts](../../contracts/README.md#identity-headers)). Those headers are always stripped from client requests.
- `auth`, `restaurants`, `menus` and `search` are public. Every other route returns 401 without a valid token. `auth` ignores the `Authorization` header entirely.

## Run

```bash
go run ./cmd/server          # http://localhost:8080/healthz
go test ./...
docker build -t foodkoala/api-gateway .
```

## Layout

```
cmd/server/        entrypoint, graceful shutdown, JSON logging
internal/server/   routes and handlers
internal/auth/     JWKS cache, RS256 verifier, auth middleware
```
