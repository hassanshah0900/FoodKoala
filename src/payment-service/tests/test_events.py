import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.consumer import envelope
from app.db import session_factory
from app.events import PaymentNotYetKnown, apply
from app.models import Payment, Status
from tests.factories import placed, status_changed


def run(raw: dict, cleanup: list[uuid.UUID]) -> bool:
    event = envelope.validate_python(raw)
    cleanup.append(event.id)
    with session_factory().begin() as s:
        return apply(s, event)


def payment(session: Session, order_id: uuid.UUID) -> Payment:
    session.expire_all()
    return session.scalars(select(Payment).where(Payment.order_id == order_id)).one()


def test_a_placed_cod_order_owes_its_total(session: Session, cleanup: list[uuid.UUID]) -> None:
    order, customer = uuid.uuid4(), uuid.uuid4()
    cleanup.append(order)
    assert run(placed(order, customer, total=119900), cleanup)
    p = payment(session, order)
    assert (p.status, p.amount_paisa, p.customer_id, p.method) == (
        Status.pending,
        119900,
        customer,
        "cod",
    )


def test_cash_is_collected_on_delivery(session: Session, cleanup: list[uuid.UUID]) -> None:
    order = uuid.uuid4()
    cleanup.append(order)
    run(placed(order, uuid.uuid4()), cleanup)
    run(status_changed(order, "accepted", frm="placed"), cleanup)
    assert payment(session, order).status is Status.pending
    run(status_changed(order, "delivered"), cleanup)
    p = payment(session, order)
    assert p.status is Status.collected and p.collected_at is not None


@pytest.mark.parametrize("to", ["rejected", "cancelled"])
def test_nothing_is_owed_for_an_order_that_did_not_happen(
    to: str, session: Session, cleanup: list[uuid.UUID]
) -> None:
    order = uuid.uuid4()
    cleanup.append(order)
    run(placed(order, uuid.uuid4()), cleanup)
    run(status_changed(order, to, frm="placed"), cleanup)
    p = payment(session, order)
    assert p.status is Status.cancelled and p.cancelled_at is not None


def test_a_settled_payment_does_not_change_again(
    session: Session, cleanup: list[uuid.UUID]
) -> None:
    order = uuid.uuid4()
    cleanup.append(order)
    run(placed(order, uuid.uuid4()), cleanup)
    run(status_changed(order, "delivered"), cleanup)
    run(status_changed(order, "cancelled"), cleanup)
    assert payment(session, order).status is Status.collected


def test_the_same_event_twice_applies_once(session: Session, cleanup: list[uuid.UUID]) -> None:
    order = uuid.uuid4()
    cleanup.append(order)
    event = placed(order, uuid.uuid4())
    assert run(event, cleanup) is True
    assert run(event, cleanup) is False
    assert session.scalars(select(Payment).where(Payment.order_id == order)).all().__len__() == 1


def test_a_status_change_before_its_order_waits(cleanup: list[uuid.UUID]) -> None:
    order = uuid.uuid4()
    early = status_changed(order, "delivered")
    with pytest.raises(PaymentNotYetKnown):
        run(early, cleanup)
    # Rolled back, so the retry after order.placed is not mistaken for a duplicate.
    cleanup.append(order)
    run(placed(order, uuid.uuid4()), cleanup)
    assert run(early, cleanup) is True


def test_unknown_fields_are_ignored_and_bad_events_rejected() -> None:
    raw = placed(uuid.uuid4(), uuid.uuid4())
    raw["data"]["newField"] = 1
    assert envelope.validate_python(raw).type == "order.placed"
    raw["data"]["totals"]["totalPaisa"] = -1
    with pytest.raises(ValueError):
        envelope.validate_python(raw)
    with pytest.raises(ValueError):
        envelope.validate_python({"id": str(uuid.uuid4()), "type": "order.eaten", "data": {}})
