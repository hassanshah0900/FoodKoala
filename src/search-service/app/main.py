import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from elasticsearch import ApiError, Elasticsearch, TransportError
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api import router
from app.consumer import IndexingConsumer
from app.index import IndexNotReady, SearchIndex
from app.settings import get_settings

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    client = Elasticsearch(settings.elasticsearch_url, request_timeout=5)
    index = SearchIndex(client, settings.index_alias)
    consumer: IndexingConsumer | None = None
    if settings.kafka_brokers:
        # The consumer creates the index once Elasticsearch is up, then keeps it current.
        consumer = IndexingConsumer(settings.kafka_brokers, settings.kafka_group_id, index)
        consumer.start()
    else:
        log.warning("KAFKA_BROKERS is not set: the search index is not kept up to date")
    app.state.index = index
    app.state.consumer = consumer
    yield
    if consumer:
        consumer.stop()
    client.close()


app = FastAPI(title="search-service", version="0.1.0", lifespan=lifespan)
app.include_router(router)


@app.exception_handler(IndexNotReady)
def index_not_ready(_: Request, __: IndexNotReady) -> JSONResponse:
    return JSONResponse({"detail": "The search index is not ready yet"}, status_code=503)


@app.exception_handler(TransportError)
@app.exception_handler(ApiError)
def search_unavailable(_: Request, err: Exception) -> JSONResponse:
    log.error("Elasticsearch failed: %s", err)
    return JSONResponse({"detail": "Search is unavailable; try again"}, status_code=503)


@app.get("/healthz")
def liveness() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz")
def readiness() -> JSONResponse:
    """Elasticsearch reachable with the index created, and the consumer running when configured."""
    index: SearchIndex = app.state.index
    try:
        if not index.ready():
            return JSONResponse({"status": "unavailable", "index": "missing"}, status_code=503)
    except (TransportError, ApiError):
        return JSONResponse({"status": "unavailable", "elasticsearch": "down"}, status_code=503)
    consumer: IndexingConsumer | None = app.state.consumer
    if consumer is not None and not consumer.alive:
        return JSONResponse({"status": "unavailable", "consumer": "stopped"}, status_code=503)
    return JSONResponse({"status": "ok"})
