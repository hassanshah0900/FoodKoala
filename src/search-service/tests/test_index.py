"""Against a real Elasticsearch: what the events build, and what searches find."""

from datetime import UTC, datetime, timedelta

from elasticsearch import Elasticsearch

from app.events import RestaurantUpdated
from app.index import SearchIndex
from tests.factories import HOME, box, item, menu, restaurant, zone

LAT, LNG = HOME


def refresh(index: SearchIndex) -> None:
    index.client.indices.refresh(index=index.alias)


def ids(page: dict) -> list[str]:
    return [r["id"] for r in page["items"]]


def search(index: SearchIndex, q: str | None = None, **kw) -> dict:
    args = {
        "lat": LAT,
        "lng": LNG,
        "q": q,
        "cuisine": None,
        "sort": "relevance",
        "page": 1,
        "limit": 20,
    }
    return index.search(**{**args, **kw})


def test_newer_revisions_win_and_older_ones_are_ignored(
    index: SearchIndex, es: Elasticsearch
) -> None:
    r = restaurant(revision=2, name="New name")
    assert index.apply_restaurant(r)
    assert not index.apply_restaurant(r.model_copy(update={"revision": 1, "name": "Old name"}))
    assert not index.apply_restaurant(r)  # redelivery
    assert index.apply_restaurant(r.model_copy(update={"revision": 3, "name": "Newest"}))

    assert index.apply_menu(
        menu(r.restaurantId, {"Biryani": [item("Chicken Biryani")]}, revision=5)
    )
    assert not index.apply_menu(menu(r.restaurantId, {}, revision=4))

    doc = es.get(index=index.alias, id=str(r.restaurantId))["_source"]
    assert doc["name"] == "Newest"
    assert doc["restaurantRevision"] == 3
    assert doc["menuRevision"] == 5
    assert [d["name"] for d in doc["dishes"]] == ["Chicken Biryani"]


def test_a_menu_before_its_restaurant_waits_for_it(index: SearchIndex) -> None:
    r = restaurant(name="Late Arrival")
    index.apply_menu(menu(r.restaurantId, {"Karahi": [item("Mutton Karahi")]}))
    refresh(index)
    assert search(index, "karahi")["items"] == []

    index.apply_restaurant(r)
    refresh(index)
    found = search(index, "karahi")["items"]
    assert [d["name"] for d in found[0]["matchingDishes"]] == ["Mutton Karahi"]


def test_only_approved_restaurants_delivering_to_the_point(index: SearchIndex) -> None:
    here = restaurant(name="Delivers here")
    pending = restaurant(name="Pending", status="pending")
    suspended = restaurant(name="Suspended", status="suspended")
    elsewhere = restaurant(name="Elsewhere", zones=[zone(box(67.0, 24.8, 67.02, 24.82))])
    no_zones = restaurant(name="No zones", zones=[])
    for r in [here, pending, suspended, elsewhere, no_zones]:
        index.apply_restaurant(r)
    refresh(index)
    assert ids(search(index)) == [str(here.restaurantId)]


def test_without_a_query_nearest_first(index: SearchIndex) -> None:
    far = restaurant(name="Far", location={"lat": 24.945, "lng": 67.135})
    near = restaurant(name="Near", location={"lat": 24.921, "lng": 67.091})
    mid = restaurant(name="Mid", location={"lat": 24.93, "lng": 67.11})
    for r in [far, near, mid]:
        index.apply_restaurant(r)
    refresh(index)
    page = search(index)
    assert [r["name"] for r in page["items"]] == ["Near", "Mid", "Far"]
    assert page["items"][0]["distanceMeters"] < page["items"][1]["distanceMeters"]


def test_matches_names_cuisines_and_dishes_forgiving_typos(index: SearchIndex) -> None:
    biryani = restaurant(name="Student Biryani", cuisines=["biryani"])
    burgers = restaurant(name="Burger Lab", cuisines=["burgers", "fast food"])
    chinese = restaurant(name="Ginsoy", cuisines=["chinese"])
    for r in [biryani, burgers, chinese]:
        index.apply_restaurant(r)
    index.apply_menu(
        menu(
            chinese.restaurantId,
            {"Rice": [item("Chicken Fried Rice"), item("Egg Biryani Fusion", description="Spicy")]},
        )
    )
    index.apply_menu(menu(burgers.restaurantId, {"Burgers": [item("Zinger Burger", 65000)]}))
    refresh(index)

    found = search(index, "biriyani")["items"]  # typo
    assert ids({"items": found})[0] == str(biryani.restaurantId)  # a name match beats a dish match
    assert str(chinese.restaurantId) in ids({"items": found})
    dish = next(r for r in found if r["id"] == str(chinese.restaurantId))["matchingDishes"]
    assert [d["name"] for d in dish] == ["Egg Biryani Fusion"]
    assert dish[0] == {
        "id": dish[0]["id"],
        "name": "Egg Biryani Fusion",
        "description": "Spicy",
        "category": "Rice",
        "imageUrl": None,
        "pricePaisa": 45000,
        "isAvailable": True,
    }

    assert ids(search(index, "zinger")) == [str(burgers.restaurantId)]
    assert ids(search(index, "fast food")) == [str(burgers.restaurantId)]
    assert search(index, "sushi")["items"] == []


def test_cuisine_filter_ignores_case(index: SearchIndex) -> None:
    a = restaurant(name="A", cuisines=["Pizza"])
    b = restaurant(name="B", cuisines=["Burgers"])
    index.apply_restaurant(a)
    index.apply_restaurant(b)
    refresh(index)
    assert ids(search(index, cuisine="pizza")) == [str(a.restaurantId)]


def test_equally_good_matches_rank_nearer_first(index: SearchIndex) -> None:
    far = restaurant(name="Pizza Point", location={"lat": 24.945, "lng": 67.135})
    near = restaurant(name="Pizza Point", location={"lat": 24.921, "lng": 67.091})
    index.apply_restaurant(far)
    index.apply_restaurant(near)
    refresh(index)
    assert ids(search(index, "pizza")) == [str(near.restaurantId), str(far.restaurantId)]


def test_result_has_delivery_terms_and_availability(index: SearchIndex) -> None:
    cheap = zone(box(67.08, 24.91, 67.10, 24.93), fee=4900, minimum=30000, minutes=25)
    paused_until = datetime.now(UTC) + timedelta(minutes=30)
    r = restaurant(zones=[zone(), cheap], pausedUntil=paused_until.isoformat())
    closed = restaurant(name="Closed", hours={"weekly": {}, "special": []})
    index.apply_restaurant(r)
    index.apply_restaurant(closed)
    refresh(index)

    page = search(index)
    got = next(x for x in page["items"] if x["id"] == str(r.restaurantId))
    assert got["delivery"] == {
        "zoneId": cheap["id"],
        "deliveryFeePaisa": 4900,
        "minimumOrderPaisa": 30000,
        "deliveryTimeMinutes": 25,
    }
    assert got["openNow"] is True
    assert got["acceptingOrders"] is False
    assert datetime.fromisoformat(got["pausedUntil"]) == paused_until
    assert got["cuisines"] == ["biryani", "pakistani"]
    assert got["location"] == {"lat": 24.9204, "lng": 67.0932}
    assert got["matchingDishes"] == []
    assert set(got) == {
        "id", "name", "cuisines", "area", "city", "logoUrl", "coverUrl", "location",
        "distanceMeters", "openNow", "pausedUntil", "acceptingOrders", "rating", "delivery",
        "matchingDishes",
    }  # fmt: skip

    shut = next(x for x in page["items"] if x["id"] == str(closed.restaurantId))
    assert (shut["openNow"], shut["acceptingOrders"], shut["pausedUntil"]) == (False, False, None)


def test_pages(index: SearchIndex) -> None:
    for i in range(5):
        index.apply_restaurant(
            restaurant(name=f"R{i}", location={"lat": 24.92 + i * 0.001, "lng": 67.09})
        )
    refresh(index)
    first = search(index, limit=2)
    third = search(index, limit=2, page=3)
    assert ([r["name"] for r in first["items"]], first["hasMore"]) == (["R0", "R1"], True)
    assert ([r["name"] for r in third["items"]], third["hasMore"]) == (["R4"], False)


def test_suggest_restaurants_dishes_and_cuisines_by_prefix(index: SearchIndex) -> None:
    house = restaurant(name="Chicken Corner", cuisines=["chinese", "chicken"])
    other = restaurant(name="Kolachi", cuisines=["bbq"])
    away = restaurant(name="Chicken Far Away", zones=[zone(box(67.0, 24.8, 67.02, 24.82))])
    for r in [house, other, away]:
        index.apply_restaurant(r)
    index.apply_menu(
        menu(other.restaurantId, {"BBQ": [item("Chicken Tikka"), item("Seekh Kabab")]})
    )
    refresh(index)

    s = index.suggest(LAT, LNG, "chick")
    assert [r["name"] for r in s["restaurants"]] == ["Chicken Corner"]
    assert s["dishes"] == [
        {
            "id": s["dishes"][0]["id"],
            "name": "Chicken Tikka",
            "restaurantId": str(other.restaurantId),
            "restaurantName": "Kolachi",
        }
    ]
    assert s["cuisines"] == ["chicken"]
    assert index.suggest(LAT, LNG, "chicken tik")["dishes"][0]["name"] == "Chicken Tikka"


def test_cuisines_near_the_point_most_common_first(index: SearchIndex) -> None:
    index.apply_restaurant(restaurant(cuisines=["Biryani", "Pakistani"]))
    index.apply_restaurant(restaurant(cuisines=["pakistani", "bbq"]))
    index.apply_restaurant(
        restaurant(cuisines=["sushi"], zones=[zone(box(67.0, 24.8, 67.02, 24.82))])
    )
    refresh(index)
    assert index.cuisines(LAT, LNG) == [
        {"cuisine": "pakistani", "restaurants": 2},
        {"cuisine": "bbq", "restaurants": 1},
        {"cuisine": "biryani", "restaurants": 1},
    ]


def test_ratings_show_and_sort_best_first_unrated_last(index: SearchIndex) -> None:
    good = restaurant(
        name="Good", rating={"average": 4.6, "count": 120}, location={"lat": 24.94, "lng": 67.13}
    )
    fine = restaurant(
        name="Fine", rating={"average": 3.9, "count": 8}, location={"lat": 24.921, "lng": 67.091}
    )
    new = restaurant(
        name="New", location={"lat": 24.9205, "lng": 67.0905}
    )  # nearest, no reviews yet
    for r in [good, fine, new]:
        index.apply_restaurant(r)
    refresh(index)

    by_rating = search(index, sort="rating")["items"]
    assert [r["name"] for r in by_rating] == ["Good", "Fine", "New"]
    assert by_rating[0]["rating"] == {"average": 4.6, "count": 120}
    assert by_rating[2]["rating"] == {"average": None, "count": 0}
    assert [r["name"] for r in search(index)["items"]] == ["New", "Fine", "Good"]  # nearest first


def test_events_from_before_ratings_count_as_unrated(index: SearchIndex) -> None:
    old = restaurant().model_dump(mode="json")
    del old["rating"]
    index.apply_restaurant(RestaurantUpdated.model_validate(old))
    refresh(index)
    assert search(index)["items"][0]["rating"] == {"average": None, "count": 0}


def test_ensure_adds_new_fields_to_an_existing_index(index: SearchIndex, es: Elasticsearch) -> None:
    index.ensure()  # the alias exists already: only the mapping is brought up to date
    mapping = es.indices.get_mapping(index=index.alias)
    (properties,) = (m["mappings"]["properties"] for m in mapping.body.values())
    assert properties["rating"]["properties"]["average"]["type"] == "float"
