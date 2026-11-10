"""Event payloads as restaurant-service and menu-service publish them."""

import uuid
from typing import Any

from app.events import MenuUpdated, RestaurantUpdated

ALL_DAY = [{"opens": "00:00", "closes": "24:00"}]
OPEN_EVERY_DAY = {
    "weekly": {d: ALL_DAY for d in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]},
    "special": [],
}

#: Gulshan-e-Iqbal, Karachi, roughly.
GULSHAN = {
    "type": "Polygon",
    "coordinates": [[[67.07, 24.9], [67.14, 24.9], [67.14, 24.95], [67.07, 24.95], [67.07, 24.9]]],
}
#: A point inside GULSHAN.
HOME = (24.92, 67.09)


def box(min_lng: float, min_lat: float, max_lng: float, max_lat: float) -> dict[str, Any]:
    ring = [[min_lng, min_lat], [max_lng, min_lat], [max_lng, max_lat], [min_lng, max_lat]]
    return {"type": "Polygon", "coordinates": [[*ring, ring[0]]]}


def zone(area: dict[str, Any] = GULSHAN, fee: int = 9900, **kw: Any) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "area": area,
        "deliveryFeePaisa": fee,
        "minimumOrderPaisa": kw.get("minimum", 50000),
        "deliveryTimeMinutes": kw.get("minutes", 35),
    }


def restaurant(**overrides: Any) -> RestaurantUpdated:
    data: dict[str, Any] = {
        "restaurantId": str(uuid.uuid4()),
        "revision": 1,
        "name": "Karachi Biryani House",
        "description": "Sindhi biryani and karahi since 1998",
        "cuisines": ["Biryani", "Pakistani"],
        "status": "approved",
        "address": {
            "line1": "Shop 4, Block 13-D",
            "area": "Gulshan-e-Iqbal",
            "city": "Karachi",
            "province": "sindh",
        },
        "location": {"lat": 24.9204, "lng": 67.0932},
        "logoUrl": None,
        "coverUrl": None,
        "hours": OPEN_EVERY_DAY,
        "pausedUntil": None,
        "zones": [zone()],
        "updatedAt": "2026-11-10T07:00:00Z",
    }
    data.update(overrides)
    return RestaurantUpdated.model_validate(data)


def item(name: str, price: int = 45000, **kw: Any) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "name": name,
        "description": kw.get("description"),
        "imageUrl": None,
        "pricePaisa": price,
        "isAvailable": kw.get("available", True),
    }


def menu(
    restaurant_id: Any, categories: dict[str, list[dict[str, Any]]], revision: int = 1
) -> MenuUpdated:
    return MenuUpdated.model_validate(
        {
            "restaurantId": str(restaurant_id),
            "revision": revision,
            "categories": [
                {"id": str(uuid.uuid4()), "name": name, "description": None, "items": items}
                for name, items in categories.items()
            ],
            "updatedAt": "2026-11-10T07:00:00Z",
        }
    )
