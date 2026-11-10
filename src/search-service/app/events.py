"""
restaurant.updated and menu.updated (contracts/events), turned into the
parts of a search document each one owns. Both are whole-state events with a
growing `revision`, so applying them is a replace guarded by that revision.
"""

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class _Event(BaseModel):
    model_config = ConfigDict(extra="ignore")


class Location(_Event):
    lat: float
    lng: float


class Address(_Event):
    line1: str
    area: str
    city: str
    province: str


class Zone(_Event):
    id: UUID
    area: dict[str, Any]
    deliveryFeePaisa: int
    minimumOrderPaisa: int
    deliveryTimeMinutes: int


class RestaurantUpdated(_Event):
    restaurantId: UUID
    revision: int
    name: str
    description: str | None
    cuisines: list[str]
    status: str
    address: Address
    location: Location
    logoUrl: str | None
    coverUrl: str | None
    hours: dict[str, Any]
    pausedUntil: datetime | None
    zones: list[Zone]


class MenuItem(_Event):
    id: UUID
    name: str
    description: str | None
    imageUrl: str | None
    pricePaisa: int
    isAvailable: bool


class MenuCategory(_Event):
    id: UUID
    name: str
    description: str | None
    items: list[MenuItem]


class MenuUpdated(_Event):
    restaurantId: UUID
    revision: int
    categories: list[MenuCategory]


class RestaurantEnvelope(_Event):
    id: UUID
    type: Literal["restaurant.updated"]
    data: RestaurantUpdated


class MenuEnvelope(_Event):
    id: UUID
    type: Literal["menu.updated"]
    data: MenuUpdated


Envelope = Annotated[RestaurantEnvelope | MenuEnvelope, Field(discriminator="type")]


def restaurant_fields(e: RestaurantUpdated) -> dict[str, Any]:
    """The restaurant's part of its search document."""
    zones = [z.model_dump(mode="json") for z in e.zones]
    return {
        "id": str(e.restaurantId),
        "name": e.name,
        "description": e.description,
        "cuisines": [c.lower() for c in e.cuisines],
        "status": e.status,
        "area": e.address.area,
        "city": e.address.city,
        "location": e.location.model_dump(),
        "geo": {"lat": e.location.lat, "lon": e.location.lng},
        "logoUrl": e.logoUrl,
        "coverUrl": e.coverUrl,
        "hours": e.hours,
        "pausedUntil": e.pausedUntil.isoformat() if e.pausedUntil else None,
        "zones": zones,
        # Indexed as geo_shape, so "delivers to this point" is a filter in the query.
        "deliveryArea": [z["area"] for z in zones],
    }


def menu_fields(e: MenuUpdated) -> dict[str, Any]:
    """The menu's part of the search document: every dish, flattened."""
    return {
        "id": str(e.restaurantId),
        "dishes": [
            {
                "id": str(item.id),
                "name": item.name,
                "description": item.description,
                "category": category.name,
                "imageUrl": item.imageUrl,
                "pricePaisa": item.pricePaisa,
                "isAvailable": item.isAvailable,
            }
            for category in e.categories
            for item in category.items
        ],
    }
