"""Against a real broker: KAFKA_BROKERS=localhost:9092 uv run pytest."""

import json
import os
import time
import uuid
from collections.abc import Callable

import pytest
from confluent_kafka import Producer
from sqlalchemy import select

from app.consumer import OrderEventConsumer
from app.db import session_factory
from app.models import Payment, Status
from tests.factories import placed, status_changed

brokers = os.environ.get("KAFKA_BROKERS")
pytestmark = pytest.mark.skipif(not brokers, reason="needs KAFKA_BROKERS")


def wait_for(check: Callable[[], bool], timeout: float = 30) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if check():
            return True
        time.sleep(0.2)
    raise AssertionError("timed out")


def status_of(order: uuid.UUID) -> Status | None:
    with session_factory()() as s:
        p = s.scalars(select(Payment).where(Payment.order_id == order)).first()
        return p.status if p else None


def test_records_and_collects_cash_from_real_order_events(cleanup: list[uuid.UUID]) -> None:
    assert brokers
    # Topics of this run only: a fresh group reads from the start and must not replay older runs.
    run = uuid.uuid4().hex[:8]
    placed_topic, changed_topic = f"test.{run}.order.placed", f"test.{run}.order.status_changed"
    producer = Producer({"bootstrap.servers": brokers})
    consumer = OrderEventConsumer(
        brokers.split(","),
        f"payment-test-{run}",
        session_factory(),
        topics=[placed_topic, changed_topic],
    )

    def send(topic: str, key: str, raw: dict | bytes) -> None:
        value = raw if isinstance(raw, bytes) else json.dumps(raw)
        if isinstance(raw, dict):
            cleanup.append(uuid.UUID(raw["id"]))
        producer.produce(topic, key=key, value=value)

    in_order, out_of_order = uuid.uuid4(), uuid.uuid4()
    cleanup += [in_order, out_of_order]
    first = placed(in_order, uuid.uuid4())
    send(placed_topic, str(in_order), first)
    send(changed_topic, str(in_order), status_changed(in_order, "delivered"))
    # This status change lands before its order.placed: it must wait, not be lost.
    send(changed_topic, str(out_of_order), status_changed(out_of_order, "cancelled", frm="placed"))
    send(placed_topic, str(in_order), first)  # redelivery of the same event
    send(placed_topic, str(in_order), placed(in_order, uuid.uuid4()))  # same order, new event id
    send(placed_topic, "junk", b"not json")
    producer.flush(10)

    consumer.start()  # after the topics exist, so the subscription finds them at once
    try:
        assert wait_for(lambda: status_of(in_order) == Status.collected)
        time.sleep(1.5)
        assert status_of(out_of_order) is None and consumer.alive

        send(placed_topic, str(out_of_order), placed(out_of_order, uuid.uuid4()))
        producer.flush(10)
        assert wait_for(lambda: status_of(out_of_order) == Status.cancelled)
        assert consumer.alive
    finally:
        consumer.stop()
