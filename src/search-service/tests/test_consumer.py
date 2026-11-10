"""Against a real broker: KAFKA_BROKERS=localhost:9092 uv run pytest."""

import json
import os
import time
import uuid
from collections.abc import Callable
from typing import Any

import pytest
from confluent_kafka import Producer
from elasticsearch import Elasticsearch, NotFoundError

from app.consumer import IndexingConsumer
from app.index import SearchIndex
from tests.factories import item, menu, restaurant

brokers = os.environ.get("KAFKA_BROKERS")
pytestmark = pytest.mark.skipif(not brokers, reason="needs KAFKA_BROKERS")


def wait_for(check: Callable[[], bool], timeout: float = 30) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if check():
            return True
        time.sleep(0.2)
    raise AssertionError("timed out")


def envelope(kind: str, data: Any) -> bytes:
    return json.dumps(
        {
            "id": str(uuid.uuid4()),
            "type": kind,
            "version": 1,
            "occurredAt": "2026-11-10T07:00:00Z",
            "source": "test",
            "data": data.model_dump(mode="json"),
        }
    ).encode()


def test_indexes_restaurant_and_menu_events(index: SearchIndex, es: Elasticsearch) -> None:
    assert brokers
    # Topics of this run only: a fresh group reads from the start and must not replay older runs.
    run = uuid.uuid4().hex[:8]
    restaurants, menus = f"test.{run}.restaurant.updated", f"test.{run}.menu.updated"
    producer = Producer({"bootstrap.servers": brokers})
    r = restaurant(name="Kafka Karahi")
    key = str(r.restaurantId)

    producer.produce(
        menus,
        key=key,
        value=envelope("menu.updated", menu(key, {"Karahi": [item("Chicken Karahi")]})),
    )
    producer.produce(restaurants, key=key, value=b"not json")
    producer.produce(
        restaurants,
        key=key,
        value=envelope("restaurant.updated", r.model_copy(update={"revision": 2})),
    )
    # An older revision arriving late changes nothing.
    producer.produce(
        restaurants,
        key=key,
        value=envelope("restaurant.updated", r.model_copy(update={"name": "Stale"})),
    )
    producer.flush(10)

    consumer = IndexingConsumer(
        brokers.split(","), f"search-test-{run}", index, topics=[restaurants, menus]
    )
    consumer.start()

    def doc() -> dict | None:
        try:
            return es.get(index=index.alias, id=key)["_source"]
        except NotFoundError:
            return None

    try:
        assert wait_for(
            lambda: (d := doc()) is not None and "restaurantRevision" in d and "menuRevision" in d
        )
        time.sleep(1)
        d = doc()
        assert d is not None
        assert (d["name"], d["restaurantRevision"], d["menuRevision"]) == ("Kafka Karahi", 2, 1)
        assert [x["name"] for x in d["dishes"]] == ["Chicken Karahi"]
        assert consumer.alive
    finally:
        consumer.stop()
