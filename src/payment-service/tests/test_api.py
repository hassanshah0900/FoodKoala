import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.consumer import envelope
from app.db import session_factory
from app.events import apply
from app.main import app
from tests.conftest import headers
from tests.factories import placed, status_changed


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.delenv("KAFKA_BROKERS", raising=False)
    with TestClient(app) as c:
        yield c


def record(raw: dict, cleanup: list[uuid.UUID]) -> None:
    event = envelope.validate_python(raw)
    cleanup.append(event.id)
    with session_factory().begin() as s:
        apply(s, event)


@pytest.mark.parametrize("path", ["/healthz", "/readyz"])
def test_health(client: TestClient, path: str) -> None:
    res = client.get(path)
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_needs_a_signed_in_user(client: TestClient) -> None:
    assert client.get(f"/orders/{uuid.uuid4()}").status_code == 401
    bad = {"X-User-Id": "nope", "X-User-Phone": "+923001234567"}
    assert client.get(f"/orders/{uuid.uuid4()}", headers=bad).status_code == 401


def test_shows_an_order_payment_to_its_customer_and_admins_only(
    client: TestClient, cleanup: list[uuid.UUID]
) -> None:
    order, customer = uuid.uuid4(), uuid.uuid4()
    cleanup.append(order)
    record(placed(order, customer, total=99900), cleanup)

    res = client.get(f"/orders/{order}", headers=headers(customer))
    assert res.status_code == 200
    body = res.json()
    assert body["orderId"] == str(order)
    assert (body["status"], body["method"], body["amountPaisa"]) == ("pending", "cod", 99900)
    assert body["collectedAt"] is None

    assert (
        client.get(f"/orders/{order}", headers=headers(uuid.uuid4(), "customer,admin")).status_code
        == 200
    )
    assert client.get(f"/orders/{order}", headers=headers(uuid.uuid4())).status_code == 404
    assert client.get(f"/orders/{uuid.uuid4()}", headers=headers(customer)).status_code == 404
    assert client.get("/orders/not-a-uuid", headers=headers(customer)).status_code == 422


def test_lists_payments_by_status_for_admins(client: TestClient, cleanup: list[uuid.UUID]) -> None:
    owed, paid = uuid.uuid4(), uuid.uuid4()
    cleanup += [owed, paid]
    record(placed(owed, uuid.uuid4()), cleanup)
    record(placed(paid, uuid.uuid4()), cleanup)
    record(status_changed(paid, "delivered"), cleanup)
    admin = headers(uuid.uuid4(), "customer,admin")

    pending = client.get("/", params={"status": "pending", "limit": 50}, headers=admin).json()
    assert str(owed) in [p["orderId"] for p in pending["items"]]
    assert str(paid) not in [p["orderId"] for p in pending["items"]]
    assert all(p["status"] == "pending" for p in pending["items"])

    first = client.get("/", params={"limit": 1}, headers=admin).json()
    assert len(first["items"]) == 1 and first["hasMore"] is True

    assert client.get("/", headers=headers(uuid.uuid4())).status_code == 403
    assert client.get("/", params={"status": "eaten"}, headers=admin).status_code == 422
