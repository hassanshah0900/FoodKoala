# search-service

**Stack:** FastAPI · Python 3.13 · Elasticsearch 8 · Kafka · [uv](https://docs.astral.sh/uv/) · **Port:** 8002

Finds restaurants and dishes that deliver to where the customer is.

- API: [`contracts/openapi/search-service.yaml`](../../contracts/openapi/search-service.yaml) (gateway: `/api/v1/search/...`, a public prefix)
- Reads [`restaurant.updated`](../../contracts/events/restaurant.updated.schema.json) and [`menu.updated`](../../contracts/events/menu.updated.schema.json) from Kafka.

## What it does

- **Search.** `GET /restaurants?lat=&lng=&q=` returns approved restaurants with a delivery zone containing the point. A query matches restaurant names, cuisines and descriptions, and dish names, categories and descriptions. Typos are tolerated ("biriyani" finds biryani), and among equally good matches nearer ones rank first. Each result has the delivery terms of the cheapest zone containing the point, whether it is open (Asia/Karachi hours, special days, past-midnight ranges) and paused, its rating, and up to three matching dishes. Without `q`, results are nearest first; `cuisine=` filters; `sort=distance` puts the nearest first and `sort=rating` the best rated (unrated last).
- **Search as you type.** `GET /suggest?q=chick bir` suggests restaurants, dishes and cuisines by word prefixes. `GET /cuisines` lists the cuisines available at the point, for the chips on the home screen.
- **Index.** There is one document per restaurant, with its dishes nested in it, behind the alias `restaurants` (index `restaurants-v1`). restaurant-service and menu-service each own their part of a document. Every event is a scripted upsert that replaces only its part, and only when its `revision` is newer than the stored one ([state events](../../contracts/README.md#event-envelope)). Redeliveries and stale events change nothing. A menu that arrives before its restaurant waits, unsearchable, until the restaurant arrives.
- **Events, at least once.** The consumer writes each event, then commits its offset. While Elasticsearch is down it retries the same event. A malformed event, or one Elasticsearch rejects for good (such as an invalid shape), is logged and skipped.
- `/readyz` checks that Elasticsearch is up and the index exists, and that the consumer is running when Kafka is configured. The consumer creates the index on its first start.

The index trails the source services by about a second (the outbox poll plus Elasticsearch's refresh).

## Run

```bash
uv sync
cp .env.example .env               # needs Elasticsearch and Kafka (make infra)
uv run uvicorn app.main:app --reload --port 8002   # http://localhost:8002/healthz
```

**Filling a new index** from restaurants and menus that already exist: run `npm run events:backfill` in restaurant-service and in menu-service. Both republish everything with fresh revisions.

**Changing the mapping:** a new field is added to the existing index on startup (`put_mapping`); restaurants get it with their next `restaurant.updated`, or all at once with a backfill. Changing a field's type needs a new index: bump `INDEX_VERSION` in `app/index.py`, point the alias at the new index (or delete the old one so the consumer creates it), and backfill as above.

## Test

```bash
ELASTICSEARCH_URL=http://localhost:9200 uv run pytest   # each run uses its own throwaway alias
KAFKA_BROKERS=localhost:9092 uv run pytest              # also the consumer against a real broker
uv run ruff check . && uv run ruff format --check .
```
