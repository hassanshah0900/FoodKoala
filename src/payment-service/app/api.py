"""HTTP API (contracts/openapi/payment-service.yaml)."""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.identity import Admin, CurrentUser
from app.models import Method, Payment, Status

router = APIRouter()
DbSession = Annotated[Session, Depends(get_session)]


class PaymentView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    orderId: uuid.UUID  # noqa: N815  (JSON names follow the contract)
    customerId: uuid.UUID  # noqa: N815
    restaurantId: uuid.UUID  # noqa: N815
    method: Method
    status: Status
    amountPaisa: int  # noqa: N815
    createdAt: datetime  # noqa: N815
    collectedAt: datetime | None  # noqa: N815
    cancelledAt: datetime | None  # noqa: N815

    @classmethod
    def of(cls, p: Payment) -> "PaymentView":
        return cls(
            id=p.id,
            orderId=p.order_id,
            customerId=p.customer_id,
            restaurantId=p.restaurant_id,
            method=p.method,
            status=p.status,
            amountPaisa=p.amount_paisa,
            createdAt=p.created_at,
            collectedAt=p.collected_at,
            cancelledAt=p.cancelled_at,
        )


class PaymentPage(BaseModel):
    items: list[PaymentView]
    page: int
    limit: int
    hasMore: bool  # noqa: N815


@router.get("/orders/{order_id}", response_model=PaymentView)
def payment_of_order(order_id: uuid.UUID, me: CurrentUser, db: DbSession) -> PaymentView:
    """The order's payment, for the customer who placed it and admins; 404 for anyone else."""
    payment = db.scalars(select(Payment).where(Payment.order_id == order_id)).first()
    if payment is None or (payment.customer_id != me.user_id and not me.is_admin):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    return PaymentView.of(payment)


@router.get("/", response_model=PaymentPage)
def list_payments(
    _: Admin,
    db: DbSession,
    payment_status: Annotated[Status | None, Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> PaymentPage:
    """All payments, newest first, e.g. `status=pending` for cash still to collect (admins)."""
    query = select(Payment).order_by(Payment.created_at.desc(), Payment.id.desc())
    if payment_status is not None:
        query = query.where(Payment.status == payment_status)
    rows = list(db.scalars(query.limit(limit + 1).offset((page - 1) * limit)))
    return PaymentPage(
        items=[PaymentView.of(p) for p in rows[:limit]],
        page=page,
        limit=limit,
        hasMore=len(rows) > limit,
    )
