from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.db import get_engine

app = FastAPI(title="payment-service", version="0.1.0")


@app.get("/healthz")
def liveness() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz")
def readiness() -> JSONResponse:
    """Postgres reachable."""
    try:
        with get_engine().connect() as connection:
            connection.execute(text("select 1"))
    except Exception:
        return JSONResponse({"status": "unavailable", "postgres": "down"}, status_code=503)
    return JSONResponse({"status": "ok"})
