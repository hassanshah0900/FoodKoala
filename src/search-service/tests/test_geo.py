from app.geo import cheapest_zone, distance_meters, in_polygon
from tests.factories import GULSHAN, box, zone


def test_distance() -> None:
    # Karachi to Lahore is about 1,030 km as the crow flies.
    assert 1_000_000 < distance_meters(24.86, 67.01, 31.52, 74.35) < 1_060_000
    assert distance_meters(24.92, 67.09, 24.92, 67.09) == 0


def test_in_polygon() -> None:
    assert in_polygon(24.92, 67.09, GULSHAN)
    assert not in_polygon(24.86, 67.01, GULSHAN)
    with_hole = {
        "type": "Polygon",
        "coordinates": [*GULSHAN["coordinates"], box(67.08, 24.91, 67.10, 24.93)["coordinates"][0]],
    }
    assert not in_polygon(24.92, 67.09, with_hole)
    assert in_polygon(24.94, 67.13, with_hole)


def test_cheapest_zone_containing_the_point() -> None:
    near = zone(box(67.08, 24.91, 67.10, 24.93), fee=4900)
    wide = zone(GULSHAN, fee=9900)
    elsewhere = zone(box(67.0, 24.8, 67.02, 24.82), fee=0)
    assert cheapest_zone([wide, near, elsewhere], 24.92, 67.09) == near
    assert cheapest_zone([wide, near, elsewhere], 24.94, 67.13) == wide
    assert cheapest_zone([wide, near], 24.81, 67.01) is None
