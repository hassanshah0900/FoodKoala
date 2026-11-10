"""Distances and point-in-zone tests for ranking and delivery terms."""

from math import asin, cos, radians, sin, sqrt
from typing import Any

EARTH_RADIUS_METERS = 6_371_008.8


def distance_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle (haversine) distance."""
    dlat, dlng = radians(lat2 - lat1), radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_METERS * asin(sqrt(a))


def _in_ring(lat: float, lng: float, ring: list[list[float]]) -> bool:
    """Ray casting over [lng, lat] positions; a point on an edge may land either way."""
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def in_polygon(lat: float, lng: float, polygon: dict[str, Any]) -> bool:
    """GeoJSON Polygon: inside the outer ring and outside every hole."""
    outer, *holes = polygon["coordinates"]
    return _in_ring(lat, lng, outer) and not any(_in_ring(lat, lng, h) for h in holes)


def cheapest_zone(zones: list[dict[str, Any]], lat: float, lng: float) -> dict[str, Any] | None:
    """The zone containing the point with the lowest fee, then minimum order, then id."""
    containing = [z for z in zones if in_polygon(lat, lng, z["area"])]
    if not containing:
        return None
    return min(containing, key=lambda z: (z["deliveryFeePaisa"], z["minimumOrderPaisa"], z["id"]))
