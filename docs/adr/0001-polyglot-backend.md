# ADR 0001: Polyglot backend with three stacks

- **Status:** accepted
- **Date:** 2026-11-06

## Context

Microservices allow each service to choose its own language. Unlimited choice
multiplies tooling, CI and maintenance cost for a small team.

## Decision

Use exactly three backend stacks:

- **Go:** `api-gateway`, `delivery-service`, `tracking-service` (high concurrency, WebSockets, small images)
- **NestJS (TypeScript):** `auth`, `user`, `restaurant`, `menu`, `cart`, `order`, `notification` (fast development, shared TypeScript with the web app)
- **FastAPI (Python):** `payment-service`, `search-service` (payment SDKs, data/ML later)

## Consequences

Cross-cutting concerns must be standardised instead of shared as code:
API contracts, event schemas, JWT validation, OpenTelemetry, JSON logs,
`/healthz` and `/readyz`, env-var config and Dockerfile conventions.
