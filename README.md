# FoodKoala 🐨

A food delivery platform for Pakistan, built as a set of microservices.

> Portfolio / learning project. Not affiliated with foodpanda or Delivery Hero.

## What it does

**Customers** pick where to deliver (an area, or "Locate me"), browse restaurants that deliver
there, filter by cuisine and search, and order with cash on delivery. Checkout has saved
addresses with a map pin, vouchers, tips, and ordering for a later time. They follow the order
live on a map, chat with the rider (text and photos), get SMS and in-app notifications, rate the
food and the rider, keep favourites, and order again in one tap.

**Restaurants** apply to be listed, then build their menu (categories, items, required and
optional choices, sold-out), opening hours (with special days like Ramadan), and delivery zones
with their own fee, minimum and time. A live kitchen screen accepts or rejects orders, marks them
ready, and holds scheduled orders until they're due. They can pause orders when busy, and see
past orders and sales reports.

**Riders** apply, and once approved go on shift. Orders are offered to the nearest rider who has
a fresh location. Riders collect the food, deliver it, collect the cash, and chat with the
customer. They see their earnings and their cash balance with FoodKoala.

**Admins** approve or suspend restaurants and riders, look up any order by its short code and
step in on it, record riders' cash deposits and payouts, and manage vouchers.

## Architecture

```
browser ──▶ web (Next.js) ──▶ api-gateway (Go, checks the JWT) ──▶ services
                                                                     │
                                       Kafka events between them ◀───┘
```

| Service | Language | Port | Owns |
|---|---|---|---|
| `web` | Next.js, TypeScript, Tailwind | 3000 | Customer site, vendor console, rider app, admin console |
| `api-gateway` | Go | 8080 | Routing, JWT verification (`/api/v1/<service>/…`) |
| `auth-service` | NestJS | 3001 | Phone + OTP sign-in, RS256 tokens, roles |
| `user-service` | NestJS | 3002 | Profiles, addresses, favourites |
| `restaurant-service` | NestJS | 3003 | Restaurants, hours, delivery zones (PostGIS), reviews |
| `menu-service` | NestJS | 3004 | Menus, items, choices, pricing |
| `cart-service` | NestJS | 3005 | Carts (Redis), reorder |
| `order-service` | NestJS | 3006 | Checkout, order life cycle, scheduling, vouchers, reports |
| `notification-service` | NestJS | 3007 | Inbox and SMS (Twilio) from events |
| `delivery-service` | Go | 8081 | Riders, shifts, assignment, earnings and settlements |
| `tracking-service` | Go | 8082 | Live rider position and ETA over WebSocket |
| `chat-service` | Go | 8083 | Customer–rider chat over WebSocket, photos |
| `payment-service` | FastAPI | 8001 | Payments (cash on delivery today) |
| `search-service` | FastAPI | 8002 | Restaurant search and listing (Elasticsearch) |

Infrastructure: PostgreSQL with PostGIS, Redis, MongoDB, Kafka, Elasticsearch, and S3 storage
(SeaweedFS locally). Services publish events through a transactional outbox, so nothing is lost
between a database write and Kafka.

Read more in [`docs/architecture.md`](docs/architecture.md) and the decision records in
[`docs/adr/`](docs/adr/). API contracts (OpenAPI) and event schemas live in [`contracts/`](contracts/).

## Running it locally

You need Docker with Compose. Everything else builds inside containers.

```sh
make up                       # build and start the whole stack
open http://localhost:3000    # the web app
```

| Command | Does |
|---|---|
| `make up` / `make down` | Start / stop everything |
| `make infra` | Only the databases, Kafka and Elasticsearch |
| `make logs s=order-service` | Follow one service's logs |
| `make ps` | What's running |

Signing in: enter any Pakistani mobile number. Locally no SMS is sent; the code is in
auth-service's log (`make logs s=auth-service`). To be an admin, start with your number in
`ADMIN_PHONES`, e.g. `ADMIN_PHONES=03001234567 make up`.

Kafka UI is at <http://localhost:8090>.

## Tests

| Kind | Where | Runs |
|---|---|---|
| Unit | next to the code (`*.spec.ts`, `*_test.go`, `tests/`) | Every service, on each PR |
| Integration | `*.e2e-spec.ts`, Go and Python tests | Against real Postgres, Redis, Kafka, MongoDB, S3 and Elasticsearch in CI |
| End to end | [`e2e/`](e2e/) | The main journeys in a real browser, on the whole stack |

The end-to-end tests cover ordering from checkout to the door (with chat and a rating),
restaurant and rider onboarding, cancelled and rejected orders, scheduled orders, and chat alerts
by SMS. Run them with:

```sh
make e2e-up                                          # the stack, with a fake SMS service
cd e2e && npm ci && npx playwright install chromium
npx playwright test                                  # or: make e2e
```

See [`e2e/README.md`](e2e/README.md) for how they're written, and [`docs/ci.md`](docs/ci.md) for
what CI runs.

## Repository layout

```
src/<service>/      one folder per service, each with its own Dockerfile and dependencies
src/web/            the Next.js app
libs/               shared code, one folder per language
contracts/          OpenAPI documents and event JSON schemas
deploy/compose/     the local stack (make up)
deploy/k8s/         Kubernetes manifests
e2e/                end-to-end tests (Playwright)
docs/               architecture, CI, decision records
.github/workflows/  CI per service, contracts, commit messages, end-to-end
```

## Workflow

GitHub flow: `main` is always deployable; all work happens in short-lived branches merged through
pull requests, and CI must pass. Commits follow
[Conventional Commits](https://www.conventionalcommits.org/) with a scope per service. See
[`CONTRIBUTING.md`](CONTRIBUTING.md).
