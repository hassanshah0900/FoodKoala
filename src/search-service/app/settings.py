"""Configuration from environment variables, validated once at startup."""

from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    port: int = 8002
    elasticsearch_url: str = "http://localhost:9200"
    #: The alias searched and written; it points at a versioned index (see index.py).
    index_alias: str = "restaurants"
    #: host:port,host:port. Unset, the index is not kept up to date (fine for local runs).
    kafka_brokers: Annotated[list[str] | None, NoDecode] = None
    kafka_group_id: str = "search-service"

    @field_validator("kafka_brokers", mode="before")
    @classmethod
    def split_brokers(cls, value: object) -> object:
        if isinstance(value, str):
            brokers = [b.strip() for b in value.split(",") if b.strip()]
            return brokers or None
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
