import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api import router
from app.consumer import OrderEventConsumer
from app.db import get_engine, session_factory
from app.settings import get_settings

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    consumer: OrderEventConsumer | None = None
    if settings.kafka_brokers:
        consumer = OrderEventConsumer(
            settings.kafka_brokers, settings.kafka_group_id, session_factory()
        )
        consumer.start()
    else:
        log.warning(
            "KAFKA_BROKERS is not set: order events are not consumed, no payments are recorded"
        )
    app.state.consumer = consumer
    yield
    if consumer:
        consumer.stop()


app = FastAPI(title="payment-service", version="0.1.0", lifespan=lifespan)
app.include_router(router)


@app.get("/healthz")
def liveness() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz")
def readiness() -> JSONResponse:
    """Postgres reachable, and the event consumer running when Kafka is configured."""
    try:
        with get_engine().connect() as connection:
            connection.execute(text("select 1"))
    except Exception:
        return JSONResponse({"status": "unavailable", "postgres": "down"}, status_code=503)
    consumer: OrderEventConsumer | None = app.state.consumer
    if consumer is not None and not consumer.alive:
        return JSONResponse({"status": "unavailable", "consumer": "stopped"}, status_code=503)
    return JSONResponse({"status": "ok"})
