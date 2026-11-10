# CI

Every pull request into `main` runs the checks of the services it touches,
and so does `main` itself after a merge. All of it lives in `.github/workflows/`.

## How the files fit together

```
.github/workflows/
├── node-service.yml      ┐  reusable: the actual jobs, one file per language
├── go-service.yml        │  (`on: workflow_call`, never triggered by themselves)
├── python-service.yml    ┘
├── ci-order-service.yml  ┐  one per service: *when* to run and *what the tests need*,
├── ci-...-service.yml    │  then `uses:` the language file with those inputs
└── commitlint.yml           commit messages of the PR
```

A service workflow is short. This is the whole of `ci-order-service.yml`,
without its comments:

```yaml
name: order-service
on:
  pull_request:
    branches: [main]
    paths: &paths                         # only when these change...
      - src/order-service/**
      - .github/workflows/ci-order-service.yml
      - .github/workflows/node-service.yml
      - biome.json
  push:
    branches: [main]
    paths: *paths                         # ...same list (a YAML anchor)
  workflow_dispatch:                      # a "Run workflow" button in the Actions tab
concurrency:                              # a new push cancels the older run of the same PR
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
jobs:
  ci:
    uses: ./.github/workflows/node-service.yml
    with: { service: order-service, postgres: true, kafka: true }
```

So a PR that only changes `src/cart-service` runs only cart-service's CI. A
change to `node-service.yml` or `biome.json` runs it for every Node service.

## What runs

Each language file has three jobs that run in parallel and show up as
separate checks on the PR (e.g. `order-service / ci / Format, lint, types,
unit tests, build`).

| | Node (NestJS) | Go | Python (FastAPI) |
|---|---|---|---|
| **Install** | `npm ci` (exactly the lockfile) | `setup-go` from `go.mod` | `uv sync --locked` |
| **Format** | Biome: `npm run format:check` | `golangci-lint fmt --diff` (gofmt, goimports) | `ruff format --check` |
| **Lint** | Biome: `npm run lint` | `golangci-lint run` (go vet, errcheck, staticcheck, ...) | `ruff check` |
| **Types** | `tsc --noEmit` | the compiler (`go build`) | `mypy app tests` |
| **Tests** | `npm test` (unit), then `npm run test:e2e` with real containers | `go test -race -p 1 ./...` with real containers | `pytest` with real containers |
| **Build** | `npm run build` | `go build ./...` | (the Docker image) |
| **Image** | `docker build` of the service's Dockerfile (not pushed) | same | same |

**Real infrastructure in tests.** The test jobs start *service containers*
(PostgreSQL with PostGIS, Redis, Kafka, Elasticsearch), the same images as
`deploy/compose/infra.yml`, on `localhost`. Each service workflow says which
ones it needs (`postgres: true`, ...). In the reusable file, a container
whose image works out to `''` is simply not started:

```yaml
services:
  postgres:
    image: ${{ inputs.postgres && 'postgis/postgis:16-3.4' || '' }}
```

The tests then get `DATABASE_URL`, `REDIS_URL`, `KAFKA_BROKERS` or
`ELASTICSEARCH_URL`. Integration tests skip themselves when their variable is
missing, which is why these are only set when the container is running.

**Caching.** `setup-node`, `setup-go` and `setup-uv` cache downloaded
dependencies keyed on the lockfile. Docker layers are cached in GitHub's
Actions cache, one scope per service. A second run of an unchanged service
takes a fraction of the first.

**Permissions.** Every workflow has `permissions: contents: read`: the job's
token can read the code and nothing else.

## Tools and their config

| Tool | Config | Run it locally |
|---|---|---|
| [Biome](https://biomejs.dev) (Node format + lint) | `/biome.json`, shared by every Node service | `npm run format` (fixes), `npm run format:check`, `npm run lint` in the service |
| [golangci-lint](https://golangci-lint.run) | `/.golangci.yml` | `golangci-lint run ./...` and `golangci-lint fmt ./...` in the service |
| ruff + mypy | `[tool.ruff]`, `[tool.mypy]` in the service's `pyproject.toml` | `uv run ruff format .`, `uv run ruff check .`, `uv run mypy app tests` |
| commitlint | `/commitlint.config.cjs` | the Husky hook checks each commit |

Biome rather than ESLint + Prettier: the services use TypeScript 7, which
typescript-eslint doesn't support yet. Biome doesn't need the TypeScript
compiler, does both formatting and linting, and is configured in JSON.

## Making checks required

Required checks are set in GitHub, not in the repo: **Settings → Branches →
Add rule for `main` → Require status checks to pass**. Because each service
only runs when its files change, require only checks that run on every PR
(`commitlint / Commit messages`). Otherwise a PR that doesn't touch a service
would wait forever for that service's checks. A failing check that isn't
required shows a red cross on the PR but doesn't block the merge button, so
don't merge red PRs. (The usual next step is one small "all checks passed"
job that runs on every PR and fails when any service's CI failed; that single
job becomes the required check.)
