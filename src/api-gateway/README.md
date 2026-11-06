# api-gateway

**Stack:** Go 1.23 (standard library only) · **Port:** 8080

Single entry point for the web app. Routes `/api/v1/<service>/...` to the matching backend service (prefix stripped). Upstream URLs come from `<NAME>_SERVICE_URL` env vars. JWT validation and rate limiting come next.

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
```
