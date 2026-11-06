# tracking-service

**Stack:** Go 1.23 (standard library only) · **Port:** 8082

Live rider locations streamed to customers over WebSockets, and ETA calculation.

## Run

```bash
go run ./cmd/server          # http://localhost:8082/healthz
go test ./...
docker build -t foodkoala/tracking-service .
```

## Layout

```
cmd/server/        entrypoint, graceful shutdown, JSON logging
internal/server/   routes and handlers
```
