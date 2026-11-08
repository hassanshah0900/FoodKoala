import pytest
from pydantic import ValidationError

from app.settings import Settings


def test_uses_psycopg_for_a_postgres_url() -> None:
    s = Settings(database_url="postgres://u:p@db:5432/x")
    assert s.database_url == "postgresql+psycopg://u:p@db:5432/x"


def test_rejects_another_database() -> None:
    with pytest.raises(ValidationError):
        Settings(database_url="mysql://u:p@db/x")


def test_splits_brokers_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KAFKA_BROKERS", "kafka:29092, kafka-2:29092")
    assert Settings(database_url="postgres://u:p@db/x").kafka_brokers == [
        "kafka:29092",
        "kafka-2:29092",
    ]


def test_empty_brokers_mean_kafka_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KAFKA_BROKERS", " ")
    assert Settings(database_url="postgres://u:p@db/x").kafka_brokers is None
