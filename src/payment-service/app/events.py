"""Order events this service applies (contracts/events), and what each does to a payment."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import Method, Payment, ProcessedEvent, Status


class _Lenient(BaseModel):
    # Producers may add fields (contracts evolve by adding); ignore what we don't use.
    model_config = ConfigDict(extra="ignore")


class Totals(_Lenient):
    totalPaisa: int = Field(ge=0)  # noqa: N815  (field names follow the contract)


class OrderPlaced(_Lenient):
    orderId: uuid.UUID  # noqa: N815
    customerId: uuid.UUID  # noqa: N815
    restaurantId: uuid.UUID  # noqa: N815
    totals: Totals
    paymentMethod: Method  # noqa: N815
    placedAt: datetime  # noqa: N815


class OrderStatusChanged(_Lenient):
    orderId: uuid.UUID  # noqa: N815
    to: str
    at: datetime


class PlacedEnvelope(_Lenient):
    id: uuid.UUID
    type: Literal["order.placed"]
    data: OrderPlaced


class StatusChangedEnvelope(_Lenient):
    id: uuid.UUID
    type: Literal["order.status_changed"]
    data: OrderStatusChanged


Envelope = Annotated[PlacedEnvelope | StatusChangedEnvelope, Field(discriminator="type")]


class PaymentNotYetKnown(Exception):
    """A status change arrived before its order.placed (separate topics): try again later."""


def apply(session: Session, event: PlacedEnvelope | StatusChangedEnvelope) -> bool:
    """
    Applies one event inside the caller's transaction. Returns False when the
    event was applied before (same envelope id) and nothing changed.
    """
    first_time = session.execute(
        insert(ProcessedEvent)
        .values(event_id=event.id, type=event.type)
        .on_conflict_do_nothing()
        .returning(ProcessedEvent.event_id)
    ).first()
    if first_time is None:
        return False
    if isinstance(event, PlacedEnvelope):
        _placed(session, event.data)
    else:
        _status_changed(session, event.data)
    return True


def _placed(session: Session, d: OrderPlaced) -> None:
    # Cash on delivery is owed from the start and collected at the door.
    session.execute(
        insert(Payment)
        .values(
            id=uuid.uuid4(),
            order_id=d.orderId,
            customer_id=d.customerId,
            restaurant_id=d.restaurantId,
            method=d.paymentMethod,
            status=Status.pending,
            amount_paisa=d.totals.totalPaisa,
            created_at=d.placedAt,
        )
        .on_conflict_do_nothing(index_elements=[Payment.order_id])
    )


def _status_changed(session: Session, d: OrderStatusChanged) -> None:
    if d.to not in ("delivered", "rejected", "cancelled"):
        return  # accepted, ready, picked up: nothing to do with money yet
    payment = session.scalars(
        select(Payment).where(Payment.order_id == d.orderId).with_for_update()
    ).first()
    if payment is None:
        raise PaymentNotYetKnown(str(d.orderId))
    if payment.status is not Status.pending:
        return
    if d.to == "delivered" and payment.method is Method.cod:
        payment.status = Status.collected
        payment.collected_at = d.at
    elif d.to in ("rejected", "cancelled"):
        payment.status = Status.cancelled
        payment.cancelled_at = d.at
