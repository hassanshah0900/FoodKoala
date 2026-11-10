"""Kafka consumer of restaurant and menu events, on its own thread next to the API."""

import json
import logging
import threading

from confluent_kafka import Consumer, KafkaError, Message, TopicPartition
from elasticsearch import ApiError, TransportError
from pydantic import TypeAdapter, ValidationError

from app.events import Envelope, MenuEnvelope, RestaurantEnvelope
from app.index import SearchIndex

TOPICS = ["restaurant.updated", "menu.updated"]
RETRY_SECONDS = 5.0

log = logging.getLogger(__name__)
envelope = TypeAdapter(Envelope)


class IndexingConsumer:
    """
    Writes each event to Elasticsearch, then commits its offset. A crash in
    between replays the event, which the revision check turns into a no-op.
    While Elasticsearch is unreachable the same event is retried, so the
    partition waits instead of skipping it.
    """

    def __init__(
        self,
        brokers: list[str],
        group_id: str,
        index: SearchIndex,
        topics: list[str] = TOPICS,
    ) -> None:
        self._index = index
        self._topics = topics
        self._consumer = Consumer(
            {
                "bootstrap.servers": ",".join(brokers),
                "group.id": group_id,
                "enable.auto.commit": False,
                "auto.offset.reset": "earliest",
                "client.id": group_id,
                # Notice topics created after we subscribed (the producer creates them on
                # first use) within seconds, not the default five minutes.
                "topic.metadata.refresh.interval.ms": 5000,
            }
        )
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="index-events", daemon=True)

    @property
    def alive(self) -> bool:
        return self._thread.is_alive()

    def start(self) -> None:
        self._thread.start()

    def stop(self, timeout: float = 10) -> None:
        self._stop.set()
        self._thread.join(timeout)

    def _run(self) -> None:
        try:
            if not self._ensure_index():
                return
            self._consumer.subscribe(self._topics)
            while not self._stop.is_set():
                message = self._consumer.poll(0.5)
                if message is None:
                    continue
                error = message.error()
                if error:
                    if error.code() != KafkaError._PARTITION_EOF:
                        log.warning("Kafka: %s", error)
                    continue
                self._handle(message)
        except Exception:
            log.exception("Index event consumer stopped")
        finally:
            self._consumer.close()

    def _ensure_index(self) -> bool:
        """Waits for Elasticsearch to create the index; False if stopped first."""
        while not self._stop.is_set():
            try:
                self._index.ensure()
                return True
            except (TransportError, ApiError) as err:
                log.warning("Elasticsearch not ready (%s); retrying in %ss", err, RETRY_SECONDS)
                self._stop.wait(RETRY_SECONDS)
        return False

    def _handle(self, message: Message) -> None:
        try:
            event = envelope.validate_python(json.loads(message.value() or b""))
        except (ValueError, ValidationError) as err:
            # A malformed event would block its partition forever; log it and move on.
            log.error(
                "Skipping malformed event at %s[%s]@%s: %s",
                message.topic(),
                message.partition(),
                message.offset(),
                err,
            )
            self._consumer.commit(message=message, asynchronous=False)
            return
        try:
            if isinstance(event, RestaurantEnvelope):
                changed = self._index.apply_restaurant(event.data)
            elif isinstance(event, MenuEnvelope):
                changed = self._index.apply_menu(event.data)
        except ApiError as err:
            if err.meta.status >= 500 or err.meta.status == 429:
                log.warning("Elasticsearch refused event %s (%s); retrying", event.id, err)
                self._retry(message)
                return
            # A document Elasticsearch will never accept (e.g. a broken zone shape).
            log.error("Elasticsearch rejected event %s for good; skipping: %s", event.id, err)
            changed = False
        except TransportError as err:
            log.warning("Elasticsearch unreachable for event %s (%s); retrying", event.id, err)
            self._retry(message)
            return
        if not changed:
            log.info("Event %s is not newer than the index; skipped", event.id)
        self._consumer.commit(message=message, asynchronous=False)

    def _retry(self, message: Message) -> None:
        """Reads the same message again after a pause; later ones on its partition wait."""
        topic, partition, offset = message.topic(), message.partition(), message.offset()
        # Always set on a consumed message; None only on errors, which never get here.
        assert topic is not None and partition is not None and offset is not None
        self._consumer.seek(TopicPartition(topic, partition, offset))
        self._stop.wait(RETRY_SECONDS)
