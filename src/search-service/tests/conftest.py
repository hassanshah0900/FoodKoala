"""Index tests need Elasticsearch (ELASTICSEARCH_URL); each run uses its own alias."""

import os
import uuid
from collections.abc import Iterator

import pytest

os.environ.setdefault("ELASTICSEARCH_URL", "http://localhost:9200")
os.environ["INDEX_ALIAS"] = f"test-restaurants-{uuid.uuid4().hex[:8]}"

from elasticsearch import Elasticsearch  # noqa: E402

from app.index import INDEX_VERSION, SearchIndex  # noqa: E402
from app.settings import get_settings  # noqa: E402


@pytest.fixture(scope="session")
def es() -> Iterator[Elasticsearch]:
    client = Elasticsearch(get_settings().elasticsearch_url, request_timeout=10)
    yield client
    client.indices.delete(
        index=f"{get_settings().index_alias}-v{INDEX_VERSION}", ignore_unavailable=True
    )
    client.close()


@pytest.fixture
def index(es: Elasticsearch) -> SearchIndex:
    """The test alias, emptied before each test."""
    idx = SearchIndex(es, get_settings().index_alias)
    idx.ensure()
    es.indices.refresh(index=idx.alias)  # unrefreshed documents would escape the delete
    es.delete_by_query(index=idx.alias, query={"match_all": {}}, refresh=True, conflicts="proceed")
    return idx
