# delivery-service

**Stack:** Go 1.23 (standard library only) · **Port:** 8081

Rider shifts and availability, assigning riders to orders, and the cash-on-delivery ledger (cash each rider is holding).

## Run

```bash
go run ./cmd/server          # http://localhost:8081/healthz
go test ./...
docker build -t foodkoala/delivery-service .
```

## Layout

```
cmd/server/        entrypoint, graceful shutdown, JSON logging
internal/server/   routes and handlers
```
