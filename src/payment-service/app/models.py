"""Tables of the `payments` schema."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Method(enum.StrEnum):
    cod = "cod"
    card = "card"
    jazzcash = "jazzcash"
    easypaisa = "easypaisa"


class Status(enum.StrEnum):
    #: Cash on delivery: the rider collects it at the door.
    pending = "pending"
    collected = "collected"
    #: The order was rejected or cancelled before anything was paid.
    cancelled = "cancelled"


def _enum(cls: type[enum.StrEnum], name: str) -> Enum:
    return Enum(cls, name=name, schema="payments", values_callable=lambda e: [m.value for m in e])


class Payment(Base):
    """What an order costs the customer and whether it has been paid. One per order."""

    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("amount_paisa >= 0", name="payments_amount_not_negative"),
        Index("payments_status_created_at_idx", "status", "created_at"),
        Index("payments_customer_id_idx", "customer_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(UUID, unique=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID)
    restaurant_id: Mapped[uuid.UUID] = mapped_column(UUID)
    method: Mapped[Method] = mapped_column(_enum(Method, "payment_method"))
    status: Mapped[Status] = mapped_column(_enum(Status, "payment_status"))
    amount_paisa: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    collected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ProcessedEvent(Base):
    """Envelope ids already applied: Kafka delivers at least once (ADR 0007)."""

    __tablename__ = "processed_events"

    event_id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True)
    type: Mapped[str] = mapped_column(String)
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
