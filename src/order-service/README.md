# order-service

**Stack:** NestJS 12 · TypeScript · **Port:** 3006

Order lifecycle (placed, accepted, preparing, picked up, delivered) and the checkout saga.

## Run

```bash
npm install
npm run dev        # http://localhost:3006/healthz
npm test           # Vitest
npm run build
docker build -t foodkoala/order-service .
```
