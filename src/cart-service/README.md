# cart-service

**Stack:** NestJS 12 · TypeScript · **Port:** 3005

Per-user carts stored in Redis, validated against the menu.

## Run

```bash
npm install
npm run dev        # http://localhost:3005/healthz
npm test           # Vitest
npm run build
docker build -t foodkoala/cart-service .
```
