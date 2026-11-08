"""Order events as order-service publishes them (contracts/events)."""

import uuid
from datetime import UTC, datetime
from typing import Any


def placed(
    order_id: uuid.UUID, customer_id: uuid.UUID, total: int = 99900, method: str = "cod"
) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "type": "order.placed",
        "version": 1,
        "occurredAt": datetime.now(UTC).isoformat(),
        "source": "order-service",
        "data": {
            "orderId": str(order_id),
            "customerId": str(customer_id),
            "restaurantId": str(uuid.uuid4()),
            "lines": [],
            "totals": {
                "subtotalPaisa": total - 9900,
                "deliveryFeePaisa": 9900,
                "totalPaisa": total,
            },
            "paymentMethod": method,
            "deliveryAddress": {"lat": 24.92, "lng": 67.09, "text": "House 7", "landmark": None},
            "estimatedDeliveryAt": datetime.now(UTC).isoformat(),
            "placedAt": datetime.now(UTC).isoformat(),
        },
    }


def status_changed(order_id: uuid.UUID, to: str, frm: str = "picked_up") -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "type": "order.status_changed",
        "version": 1,
        "occurredAt": datetime.now(UTC).isoformat(),
        "source": "order-service",
        "data": {
            "orderId": str(order_id),
            "customerId": str(uuid.uuid4()),
            "restaurantId": str(uuid.uuid4()),
            "from": frm,
            "to": to,
            "by": "admin",
            "reason": None,
            "at": datetime.now(UTC).isoformat(),
        },
    }
