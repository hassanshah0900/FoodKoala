import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.mark.parametrize("path", ["/healthz", "/readyz"])
def test_health(path: str) -> None:
    res = client.get(path)
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
