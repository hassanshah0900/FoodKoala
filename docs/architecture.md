# Architecture

FoodKoala is a food delivery platform for Pakistan. It is split into
microservices behind a single API gateway, with one web application for all
user roles.

```
             ┌──────────────────────────────────────────────┐
 Browser ──▶ │ web (Next.js): customer · /vendor · /rider · /admin │
             └──────────────────────┬───────────────────────┘
                                    ▼
                          api-gateway (Go)  ── JWT check, routing, rate limit
                                    │
   ┌──────────┬──────────┬──────────┼──────────┬──────────┬──────────┐
   ▼          ▼          ▼          ▼          ▼          ▼          ▼
 auth      user    restaurant     menu       cart      order     payment ...
                                    │
                                    ▼
                         Kafka (domain events)
                    OrderPlaced · PaymentCompleted ·
                    RiderAssigned · OrderDelivered
```

## Services

| Service | Stack | Port | Responsibility | Data |
|---|---|---|---|---|
| `web` | Next.js | 3000 | UI for customers, vendors, riders (PWA) and admins | — |
| `api-gateway` | Go | 8080 | Single entry point, JWT validation, routing, rate limiting | — |
| `auth-service` | NestJS | 3001 | Phone + OTP login, JWT issuing, roles | PostgreSQL, Redis |
| `user-service` | NestJS | 3002 | Profiles, saved addresses (lat/lng + landmark) | PostgreSQL |
| `restaurant-service` | NestJS | 3003 | Vendor onboarding, hours, delivery zones, province (for tax) | PostgreSQL + PostGIS |
| `menu-service` | NestJS | 3004 | Menus, items, add-ons, availability | PostgreSQL |
| `cart-service` | NestJS | 3005 | Per-user carts | Redis |
| `order-service` | NestJS | 3006 | Order lifecycle, checkout saga | PostgreSQL |
| `notification-service` | NestJS | 3007 | SMS, WhatsApp, push, email (Urdu / English) | MongoDB |
| `delivery-service` | Go | 8081 | Rider shifts, availability, assignment, COD cash ledger | PostgreSQL, Redis (geo) |
| `tracking-service` | Go | 8082 | Live rider location over WebSockets, ETA | Redis |
| `chat-service` | Go | 8083 | Customer–rider chat with photos and read receipts, live over WebSockets | MongoDB, Redis, S3 |
| `payment-service` | FastAPI | 8001 | COD, JazzCash, Easypaisa, cards, refunds, wallet | PostgreSQL |
| `search-service` | FastAPI | 8002 | Restaurant and dish search, ranking | Elasticsearch |

Phase 2: promotions, subscriptions, reviews, pricing/tax, settlements,
pandamart-style grocery inventory, support, analytics.

## Pakistan-specific concerns

- Cash on delivery is the default payment method; riders carry a cash balance.
- Provincial sales tax on services (PRA, SRB, KPRA, BRA) depends on the restaurant's province.
- Phone number (+92) + OTP login.
- Bilingual UI (Urdu RTL and English); Ramadan schedules and campaigns.

## Communication

- **Synchronous:** REST/JSON through the gateway (OpenAPI specs in `contracts/openapi/`).
- **Asynchronous:** Kafka events (schemas in `contracts/events/`).

## Repository layout

```
src/<service>/        one folder per service, each with its own Dockerfile
libs/                 shared code, one folder per language
contracts/            OpenAPI specs and event schemas
deploy/compose/       local Docker Compose files
deploy/k8s/           Kubernetes manifests
e2e/                  end-to-end tests of the main journeys (Playwright)
docs/                 architecture and ADRs
```
