"""Most tests need a migrated PostgreSQL (DATABASE_URL); the Kafka test also needs KAFKA_BROKERS."""

import os
import uuid
from collections.abc import Iterator

import pytest
from sqlalchemy import delete
from sqlalchemy.orm import Session

os.environ.setdefault("DATABASE_URL", "postgres://foodkoala:foodkoala@localhost:5432/foodkoala")

from app.db import session_factory  # noqa: E402
from app.models import Payment, ProcessedEvent  # noqa: E402


@pytest.fixture
def session() -> Iterator[Session]:
    with session_factory()() as s:
        yield s


@pytest.fixture
def cleanup() -> Iterator[list[uuid.UUID]]:
    """Order ids (and event ids) to delete after the test."""
    ids: list[uuid.UUID] = []
    yield ids
    with session_factory().begin() as s:
        s.execute(delete(Payment).where(Payment.order_id.in_(ids)))
        s.execute(delete(ProcessedEvent).where(ProcessedEvent.event_id.in_(ids)))


def headers(user_id: uuid.UUID, roles: str = "customer") -> dict[str, str]:
    return {"X-User-Id": str(user_id), "X-User-Phone": "+923001234567", "X-User-Roles": roles}
