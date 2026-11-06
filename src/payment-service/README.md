# payment-service

**Stack:** FastAPI · Python 3.13 · [uv](https://docs.astral.sh/uv/) · **Port:** 8001

Payments for Pakistan: cash on delivery, JazzCash, Easypaisa, cards, refunds and wallet.

## Run

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8001   # http://localhost:8001/healthz
uv run pytest
uv run ruff check .
docker build -t foodkoala/payment-service .
```
