"""Kafka consumer of order events, on its own thread next to the API."""

import json
import logging
import threading

from confluent_kafka import Consumer, KafkaError, Message, TopicPartition
from pydantic import TypeAdapter, ValidationError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.events import Envelope, PaymentNotYetKnown, apply

TOPICS = ["order.placed", "order.status_changed"]
RETRY_SECONDS = 1.0
DATABASE_RETRY_SECONDS = 5.0

log = logging.getLogger(__name__)
envelope = TypeAdapter(Envelope)


class OrderEventConsumer:
    """
    Applies each event in its own transaction, then commits its offset: a
    crash in between replays the event, which the processed-events table
    turns into a no-op (ADR 0007). A status change that arrives before its
    order.placed is retried from the same offset until the payment exists.
    """

    def __init__(
        self,
        brokers: list[str],
        group_id: str,
        sessions: sessionmaker[Session],
        topics: list[str] = TOPICS,
    ) -> None:
        self._sessions = sessions
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
        self._thread = threading.Thread(target=self._run, name="order-events", daemon=True)

    @property
    def alive(self) -> bool:
        return self._thread.is_alive()

    def start(self) -> None:
        self._consumer.subscribe(self._topics)
        self._thread.start()

    def stop(self, timeout: float = 10) -> None:
        self._stop.set()
        self._thread.join(timeout)

    def _run(self) -> None:
        try:
            while not self._stop.is_set():
                message = self._consumer.poll(0.5)
                if message is None:
                    continue
                if message.error():
                    if message.error().code() != KafkaError._PARTITION_EOF:
                        log.warning("Kafka: %s", message.error())
                    continue
                self._handle(message)
        except Exception:
            log.exception("Order event consumer stopped")
        finally:
            self._consumer.close()

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
            with self._sessions.begin() as session:
                applied = apply(session, event)
        except PaymentNotYetKnown:
            log.info(
                "Payment for order %s not recorded yet; retrying %s", event.data.orderId, event.id
            )
            self._retry(message, RETRY_SECONDS)
            return
        except SQLAlchemyError:
            log.exception("Could not apply event %s; retrying", event.id)
            self._retry(message, DATABASE_RETRY_SECONDS)
            return
        if not applied:
            log.info("Event %s was applied before; skipping", event.id)
        self._consumer.commit(message=message, asynchronous=False)

    def _retry(self, message: Message, seconds: float) -> None:
        """Reads the same message again after a pause; later ones on its partition wait."""
        self._consumer.seek(TopicPartition(message.topic(), message.partition(), message.offset()))
        self._stop.wait(seconds)
