"""Configuration from environment variables, validated once at startup."""

from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    port: int = 8001
    database_url: str = Field(description="postgres://user:pass@host:5432/db")
    #: host:port,host:port. Unset, order events are not consumed (fine locally without Kafka).
    kafka_brokers: Annotated[list[str] | None, NoDecode] = None
    kafka_group_id: str = "payment-service"

    @field_validator("database_url")
    @classmethod
    def use_psycopg(cls, url: str) -> str:
        """Accept the postgres:// URL every other service uses and pick the psycopg 3 driver."""
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url.removeprefix(prefix)
        if url.startswith("postgresql+psycopg://"):
            return url
        raise ValueError("expected a postgres:// URL")

    @field_validator("kafka_brokers", mode="before")
    @classmethod
    def split_brokers(cls, value: object) -> object:
        if isinstance(value, str):
            brokers = [b.strip() for b in value.split(",") if b.strip()]
            return brokers or None
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # values come from the environment
