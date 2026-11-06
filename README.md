# FoodKoala 🐨

A food delivery platform for Pakistan, built as a set of microservices.

> Portfolio / learning project. Not affiliated with foodpanda or Delivery Hero.

## Architecture at a glance

| Layer | Tech |
|---|---|
| Web (customer, vendor, rider PWA, admin) | Next.js + TypeScript + Tailwind |
| Edge / high-concurrency services | Go |
| Business services | Node.js (NestJS) |
| Payments / search | Python (FastAPI) |
| Messaging | Kafka |
| Data | PostgreSQL, Redis, Elasticsearch |
| Deploy | Docker, Kubernetes |

See [`docs/`](docs/) for details.

## Workflow

GitHub flow: `main` is always deployable; all work happens in short-lived
branches merged through pull requests. Commits follow
[Conventional Commits](https://www.conventionalcommits.org/).
