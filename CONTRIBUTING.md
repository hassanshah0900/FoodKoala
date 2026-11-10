# Contributing to FoodKoala

## GitHub flow

1. `main` is always deployable. Never commit to it directly.
2. Create a short-lived branch from the latest `main`:

   | Prefix | Use for |
   |---|---|
   | `feat/` | new functionality |
   | `fix/` | bug fixes |
   | `chore/` | tooling, config, housekeeping |
   | `docs/` | documentation only |
   | `ci/` | pipelines |
   | `refactor/`, `test/`, `perf/` | as named |

   Example: `feat/order-place-order`, `fix/cart-total-rounding`.
3. Commit using Conventional Commits (below), push, and open a pull request.
4. CI must pass (see [docs/ci.md](docs/ci.md)). The PR is reviewed and **squash-merged** by the maintainer.
5. Delete the branch after merging.

## Conventional Commits

```
<type>(<scope>): <short summary in imperative mood>

[optional body]

[optional footer, e.g. BREAKING CHANGE: ... / Closes #12]
```

- **Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- **Scopes:** the service or area changed, e.g. `order`, `payment`, `web`, `api-gateway`, `deploy`, `ci`.
  The full list lives in [`commitlint.config.cjs`](commitlint.config.cjs).

Examples:

```
feat(order): add order state machine
fix(payment): handle JazzCash timeout callback
ci(web): build image on changes to src/web
```

Commit messages are checked locally by a Husky `commit-msg` hook
(run `npm install` once at the repo root) and on every PR by CI.

## Service rules

Every service, regardless of language, must:

- expose `GET /healthz` (liveness) and `GET /readyz` (readiness)
- read all configuration from environment variables and ship a `.env.example`
- log structured JSON to stdout
- have a multi-stage `Dockerfile` that runs as a non-root user
- document its API in `contracts/openapi/<service>.yaml` and its events in `contracts/events/`
