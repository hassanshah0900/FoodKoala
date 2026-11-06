# ADR 0004: RS256 access tokens published through JWKS

- **Status:** accepted
- **Date:** 2026-11-07

## Context

`auth-service` issues access tokens that `api-gateway` (Go) and possibly other
services verify. With a shared HMAC secret (HS256), every verifier could also
forge tokens.

## Decision

- Access tokens are JWTs signed with **RS256** by `auth-service` only. They
  live for 15 minutes and carry `sub` (user id), `phone`, `roles`, `iss`
  and `aud`.
- The public keys are published at `GET /.well-known/jwks.json`
  (`/api/v1/auth/.well-known/jwks.json` through the gateway). Each key has
  a `kid` (its RFC 7638 thumbprint), so keys can be rotated by publishing
  the new key next to the old one.
- Refresh tokens are opaque random strings, stored hashed in PostgreSQL and
  rotated on every use. Reusing an already rotated token revokes the whole
  token family.

## Consequences

Verifiers only need the JWKS URL and cache the keys. The private key is a
secret for `auth-service` alone (`JWT_PRIVATE_KEY`, PEM). The `JWT_SECRET`
entry in the root `.env.example` is no longer needed for access tokens.
