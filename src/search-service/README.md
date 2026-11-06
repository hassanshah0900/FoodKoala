# search-service

**Stack:** FastAPI · Python 3.13 · [uv](https://docs.astral.sh/uv/) · **Port:** 8002

Restaurant and dish search with location filters and ranking, backed by Elasticsearch.

## Run

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8002   # http://localhost:8002/healthz
uv run pytest
uv run ruff check .
docker build -t foodkoala/search-service .
```
