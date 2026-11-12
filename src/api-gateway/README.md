# api-gateway

**Stack:** Go 1.26 (standard library only) · **Port:** 8080

Single entry point for the web app. Routes `/api/v1/<service>/...` to the matching backend service (prefix stripped). Upstream URLs come from `<NAME>_SERVICE_URL` env vars. Rate limiting comes next.

## Authentication

Per [ADR 0005](../../docs/adr/0005-gateway-authenticates-services-authorize.md), the gateway verifies access tokens and services do authorization:

- `Authorization: Bearer <token>` is verified against auth-service's JWKS (`AUTH_JWKS_URL`, cached 5 min, refetched on an unknown `kid`). Only `RS256` is accepted, and `exp`, `nbf`, `iss` and `aud` are checked.
- Valid tokens reach services as `X-User-Id`, `X-User-Roles` and `X-User-Phone` ([contracts](../../contracts/README.md#identity-headers)). Those headers are always stripped from client requests.
- `auth`, `restaurants`, `menus` and `search` are public. Every other route returns 401 without a valid token. `auth` ignores the `Authorization` header entirely.
- WebSockets (browsers can't set `Authorization` on them) may send the token as the subprotocol `bearer.<token>` instead ([contracts](../../contracts/README.md#websockets)). The gateway always removes it from `Sec-WebSocket-Protocol` before proxying; the upgrade itself passes through.

## Health

- `GET /healthz` answers 200 while the process runs.
- `GET /readyz` answers 503 until auth-service's signing keys have been fetched once, since every token would be rejected before that. Afterwards it stays ready through an auth-service outage, because the cached keys keep working. It doesn't check the other services: one of them being down only affects its own routes (502).
- `server healthcheck` exits 0 if `/readyz` answers 200. Compose uses it, because the distroless image has no curl or wget.

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
