from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.index import SearchIndex
from app.main import app
from app.settings import get_settings
from tests.factories import HOME, item, menu, restaurant


@pytest.fixture(autouse=True)
def without_kafka(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """The app under test reads no events; tests write the index themselves."""
    monkeypatch.delenv("KAFKA_BROKERS", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client(index: SearchIndex) -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def test_search_suggest_and_cuisines(client: TestClient, index: SearchIndex) -> None:
    r = restaurant(name="Savour Foods", cuisines=["Pulao"])
    index.apply_restaurant(r)
    index.apply_menu(menu(r.restaurantId, {"Pulao": [item("Pulao Kabab", 55000)]}))
    index.client.indices.refresh(index=index.alias)
    at = {"lat": HOME[0], "lng": HOME[1]}

    res = client.get("/restaurants", params={**at, "q": " pulao kebab ", "cuisine": "PULAO"})
    assert res.status_code == 200
    body = res.json()
    assert (body["page"], body["limit"], body["hasMore"]) == (1, 20, False)
    assert [x["name"] for x in body["items"]] == ["Savour Foods"]
    assert body["items"][0]["matchingDishes"][0]["name"] == "Pulao Kabab"

    assert client.get("/suggest", params={**at, "q": "sav"}).json()["restaurants"][0]["name"] == (
        "Savour Foods"
    )
    assert client.get("/cuisines", params=at).json() == [{"cuisine": "pulao", "restaurants": 1}]


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"lat": 24.9},
        {"lat": 91, "lng": 67},
        {"lat": 24.9, "lng": 67, "limit": 51},
        {"lat": 24.9, "lng": 67, "page": 51},
        {"lat": 24.9, "lng": 67, "sort": "rating"},
        {"lat": 24.9, "lng": 67, "q": ""},
    ],
)
def test_rejects_bad_queries(client: TestClient, params: dict) -> None:
    assert client.get("/restaurants", params=params).status_code == 422


def test_suggest_needs_text(client: TestClient) -> None:
    assert client.get("/suggest", params={"lat": 24.9, "lng": 67}).status_code == 422


def test_ready_once_the_index_exists(client: TestClient, index: SearchIndex) -> None:
    assert client.get("/readyz").json() == {"status": "ok"}


def test_503_while_the_index_is_missing(index: SearchIndex) -> None:
    from elasticsearch import Elasticsearch

    with TestClient(app) as c:
        c.app.state.index = SearchIndex(
            Elasticsearch(index.client.transport.node_pool.get().base_url), "missing-alias"
        )
        assert c.get("/restaurants", params={"lat": 24.9, "lng": 67}).status_code == 503
        assert c.get("/readyz").status_code == 503


def test_liveness(client: TestClient) -> None:
    assert client.get("/healthz").json() == {"status": "ok"}
