# ADR 0005: The gateway authenticates, services authorize

- **Status:** accepted
- **Date:** 2026-11-07

## Context

Every request from the web app goes through `api-gateway`. Access tokens are
RS256 JWTs from `auth-service` (ADR 0004). Verifying them in every service, in
three languages, would repeat the same security-critical code.

## Decision

- `api-gateway` verifies the access token once: signature against the JWKS of
  `auth-service` (cached), `alg` must be `RS256`, plus `exp`, `nbf`, `iss`
  and `aud`.
- It forwards the caller's identity to services as headers: `X-User-Id`,
  `X-User-Roles` (comma separated) and `X-User-Phone`. Any `X-User-*`
  header sent by a client is removed first, so clients cannot spoof them.
- Routes under `auth`, `restaurants`, `menus` and `search` are public: a
  request without a token passes through anonymously. Every other route
  needs a valid token. A present but invalid token is always rejected with
  401, except on `auth`, which ignores the `Authorization` header (a client
  refreshing its session may still hold an expired access token).
- Services do **authorization**: they read the identity headers and decide
  whether that user and role may do the action (e.g. only a `vendor` may edit
  its own menu).

## Consequences

Services only trust the `X-User-*` headers because just the gateway can reach
them. Network policy in Compose/Kubernetes must keep services private. A
service exposed some other way must verify the JWT itself, using the same JWKS.
