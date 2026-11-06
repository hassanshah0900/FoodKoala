# ADR 0006: Ownership checks ask the service that owns the data

- **Status:** accepted
- **Date:** 2026-11-07

## Context

Several services need to know whether the caller may manage a restaurant.
For example, menu-service lets only the owner (or an admin) edit a menu.
Ownership lives in restaurant-service (`restaurants.owner_id`), and services
never read each other's database schemas (ADR 0003).

## Decision

- A service that needs an ownership check calls the owning service over HTTP
  and forwards the caller's identity headers. For restaurants that is
  `GET {RESTAURANT_SERVICE_URL}/{id}`. Only the owner and admins get
  `ownerId` back, so the response itself answers the question.
- The call has a short timeout (2 s). If the owning service is down, the
  request fails with 503. It must never fail open.
- Only writes are checked this way. Reads that need no ownership (a public
  menu) make no extra call.
- Later, when Kafka is wired (ADR 0002), a service may keep a local copy of
  ownership from `restaurant.*` events instead. It switches over only once
  those events exist.

## Consequences

Writes depend on restaurant-service being up, and pay one internal round
trip each. This is acceptable for the low volume of vendor edits. Services
must be able to reach each other on the private network, which DevOps
configures through each service's `*_SERVICE_URL` variables.
