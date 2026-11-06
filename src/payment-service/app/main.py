from fastapi import FastAPI

app = FastAPI(title="payment-service", version="0.1.0")


@app.get("/healthz")
def liveness() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz")
def readiness() -> dict[str, str]:
    # Add dependency checks (database, Kafka) here as they are introduced.
    return {"status": "ok"}


# TODO(payment): Payment intents, COD flow, JazzCash/Easypaisa callbacks.
