"""
The Elasticsearch index: one document per restaurant, its dishes nested in it.

restaurant-service and menu-service each own part of a document, and their
events arrive independently and at least once. Every write is a scripted
upsert that replaces only its part, and only when the event's revision is
newer than the one stored for that part; a menu may arrive before its
restaurant and waits, unsearchable, until the restaurant does.
"""

import logging
from datetime import UTC, datetime
from typing import Any

from elasticsearch import BadRequestError, Elasticsearch

from app.events import MenuUpdated, RestaurantUpdated, menu_fields, restaurant_fields
from app.geo import cheapest_zone, distance_meters
from app.hours import is_open_at

log = logging.getLogger(__name__)

#: Bump with a mapping change; the new index then needs a backfill (see README).
INDEX_VERSION = 1

SETTINGS: dict[str, Any] = {
    "number_of_shards": 1,
    "analysis": {
        # Lowercase and fold accents, so "Café" matches "cafe".
        "analyzer": {"folding": {"tokenizer": "standard", "filter": ["lowercase", "asciifolding"]}},
        "normalizer": {"lowercase": {"type": "custom", "filter": ["lowercase", "asciifolding"]}},
    },
}

_suggestable_text = {
    "type": "text",
    "analyzer": "folding",
    "fields": {"suggest": {"type": "search_as_you_type", "analyzer": "folding"}},
}

MAPPINGS: dict[str, Any] = {
    # Everything is kept in _source for the results; only these fields are searchable.
    "dynamic": False,
    "properties": {
        "id": {"type": "keyword"},
        "name": _suggestable_text,
        "description": {"type": "text", "analyzer": "folding"},
        "cuisines": {
            "type": "keyword",
            "normalizer": "lowercase",
            "fields": {"text": {"type": "text", "analyzer": "folding"}},
        },
        "status": {"type": "keyword"},
        "city": {"type": "keyword"},
        "geo": {"type": "geo_point"},
        "deliveryArea": {"type": "geo_shape"},
        "rating": {"properties": {"average": {"type": "float"}, "count": {"type": "integer"}}},
        "restaurantRevision": {"type": "integer"},
        "menuRevision": {"type": "integer"},
        "dishes": {
            "type": "nested",
            "properties": {
                "id": {"type": "keyword"},
                "name": _suggestable_text,
                "description": {"type": "text", "analyzer": "folding"},
                "category": {"type": "text", "analyzer": "folding"},
                "pricePaisa": {"type": "integer"},
                "isAvailable": {"type": "boolean"},
            },
        },
    },
}

# Replaces one part of the document unless it already holds that revision or a newer one.
_REPLACE_IF_NEWER = """
def stored = ctx._source[params.revisionField];
if (stored != null && stored >= params.revision) {
  ctx.op = 'noop';
} else {
  ctx._source.putAll(params.fields);
  ctx._source[params.revisionField] = params.revision;
}
"""

DISHES_PER_RESULT = 3
SUGGESTIONS = 5
CUISINES = 50


class IndexNotReady(Exception):
    """The alias does not exist yet: no event has been consumed to create it."""


class SearchIndex:
    def __init__(self, client: Elasticsearch, alias: str) -> None:
        self.client = client
        self.alias = alias

    # --- writes -----------------------------------------------------------------

    def ensure(self) -> None:
        """
        Creates the versioned index behind the alias, or adds fields new to
        MAPPINGS to the existing one. Changing a field's type needs a new
        INDEX_VERSION instead.
        """
        if self.client.indices.exists_alias(name=self.alias):
            self.client.indices.put_mapping(index=self.alias, properties=MAPPINGS["properties"])
            return
        name = f"{self.alias}-v{INDEX_VERSION}"
        try:
            self.client.indices.create(
                index=name,
                settings=SETTINGS,
                mappings=MAPPINGS,
                aliases={self.alias: {"is_write_index": True}},
            )
            log.info("Created index %s behind alias %s", name, self.alias)
        except BadRequestError as err:
            # Another replica created it first.
            if err.error != "resource_already_exists_exception":
                raise

    def apply_restaurant(self, event: RestaurantUpdated) -> bool:
        return self._replace(
            str(event.restaurantId), "restaurantRevision", event.revision, restaurant_fields(event)
        )

    def apply_menu(self, event: MenuUpdated) -> bool:
        return self._replace(
            str(event.restaurantId), "menuRevision", event.revision, menu_fields(event)
        )

    def _replace(self, doc_id: str, revision_field: str, revision: int, fields: dict) -> bool:
        """Returns False when the stored part was as new or newer (nothing changed)."""
        res = self.client.update(
            index=self.alias,
            id=doc_id,
            script={
                "source": _REPLACE_IF_NEWER,
                "params": {"revisionField": revision_field, "revision": revision, "fields": fields},
            },
            upsert={},
            scripted_upsert=True,
            retry_on_conflict=5,
        )
        return res["result"] != "noop"

    # --- reads ------------------------------------------------------------------

    def search(
        self,
        lat: float,
        lng: float,
        q: str | None,
        cuisine: str | None,
        sort: str,
        page: int,
        limit: int,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        body = search_body(lat, lng, q, cuisine, sort, (page - 1) * limit, limit + 1)
        res = self._search(body)
        hits = res["hits"]["hits"]
        now = now or datetime.now(UTC)
        return {
            "items": [to_result(h, lat, lng, now) for h in hits[:limit]],
            "page": page,
            "limit": limit,
            "hasMore": len(hits) > limit,
        }

    def suggest(self, lat: float, lng: float, q: str) -> dict[str, Any]:
        res = self._msearch([suggest_body(lat, lng, q), cuisines_body(lat, lng)])
        hits = res[0]["hits"]["hits"]
        restaurants = [
            {
                "id": h["_source"]["id"],
                "name": h["_source"]["name"],
                "logoUrl": h["_source"].get("logoUrl"),
            }
            for h in hits
            if "name" in h.get("matched_queries", [])
        ][:SUGGESTIONS]
        dishes = sorted(
            (
                (
                    d["_score"],
                    {
                        "id": d["_source"]["id"],
                        "name": d["_source"]["name"],
                        "restaurantId": h["_source"]["id"],
                        "restaurantName": h["_source"]["name"],
                    },
                )
                for h in hits
                for d in h.get("inner_hits", {}).get("dishes", {}).get("hits", {}).get("hits", [])
            ),
            key=lambda pair: -pair[0],
        )
        prefix = " ".join(q.lower().split())
        cuisines = [
            b["key"]
            for b in res[1]["aggregations"]["cuisines"]["buckets"]
            if b["key"].startswith(prefix)
        ][:SUGGESTIONS]
        return {
            "restaurants": restaurants,
            "dishes": [d for _, d in dishes[:SUGGESTIONS]],
            "cuisines": cuisines,
        }

    def cuisines(self, lat: float, lng: float) -> list[dict[str, Any]]:
        res = self._search(cuisines_body(lat, lng, CUISINES))
        return [
            {"cuisine": b["key"], "restaurants": b["doc_count"]}
            for b in res["aggregations"]["cuisines"]["buckets"]
        ]

    def ready(self) -> bool:
        return bool(self.client.indices.exists_alias(name=self.alias))

    def _search(self, body: dict[str, Any]) -> Any:
        if not self.client.indices.exists_alias(name=self.alias):
            raise IndexNotReady
        return self.client.search(index=self.alias, body=body)

    def _msearch(self, bodies: list[dict[str, Any]]) -> list[Any]:
        if not self.client.indices.exists_alias(name=self.alias):
            raise IndexNotReady
        searches: list[dict[str, Any]] = []
        for body in bodies:
            searches += [{"index": self.alias}, body]
        responses = self.client.msearch(searches=searches)["responses"]
        for r in responses:
            if "error" in r:
                raise RuntimeError(f"search failed: {r['error']}")
        return responses


# --- queries (pure, so they can be tested without Elasticsearch) -------------------


def delivers_to(lat: float, lng: float) -> list[dict[str, Any]]:
    """Approved restaurants with a delivery zone containing the point."""
    return [
        {"term": {"status": "approved"}},
        {
            "geo_shape": {
                "deliveryArea": {
                    "shape": {"type": "point", "coordinates": [lng, lat]},
                    "relation": "intersects",
                }
            }
        },
    ]


def _nearest(lat: float, lng: float) -> dict[str, Any]:
    return {"_geo_distance": {"geo": {"lat": lat, "lon": lng}, "order": "asc", "unit": "m"}}


def _sort(sort: str, lat: float, lng: float, by_score: bool) -> list[Any]:
    """Ties always go to the nearest, then the id, so pages are stable."""
    tail = [_nearest(lat, lng), {"id": "asc"}]
    if sort == "rating":
        return [{"rating.average": {"order": "desc", "missing": "_last"}}, *tail]
    if sort == "relevance" and by_score:
        return ["_score", *tail]
    return tail


def search_body(
    lat: float, lng: float, q: str | None, cuisine: str | None, sort: str, offset: int, size: int
) -> dict[str, Any]:
    filters = delivers_to(lat, lng)
    if cuisine:
        filters.append({"term": {"cuisines": cuisine}})
    body: dict[str, Any] = {
        "from": offset,
        "size": size,
        # Dishes come back through inner_hits; the whole menu would be dead weight.
        "_source": {"excludes": ["dishes", "deliveryArea", "geo"]},
    }
    body["sort"] = _sort(sort, lat, lng, by_score=bool(q))
    if not q:
        body["query"] = {"bool": {"filter": filters}}
        return body

    matches = {
        "bool": {
            "should": [
                {
                    "multi_match": {
                        "query": q,
                        "fields": ["name^3", "cuisines.text^2", "description"],
                        "fuzziness": "AUTO",
                    }
                },
                {
                    "nested": {
                        "path": "dishes",
                        "score_mode": "max",
                        "query": {
                            "multi_match": {
                                "query": q,
                                "fields": [
                                    "dishes.name^2",
                                    "dishes.category",
                                    "dishes.description",
                                ],
                                "fuzziness": "AUTO",
                            }
                        },
                        "inner_hits": {"size": DISHES_PER_RESULT},
                    }
                },
            ],
            "minimum_should_match": 1,
        }
    }
    body["query"] = {
        "function_score": {
            "query": {"bool": {"filter": filters, "must": [matches]}},
            # Among similar matches, nearer wins: full weight within 1 km, half at 4 km.
            "functions": [
                {
                    "gauss": {
                        "geo": {
                            "origin": {"lat": lat, "lon": lng},
                            "offset": "1km",
                            "scale": "3km",
                            "decay": 0.5,
                        }
                    }
                }
            ],
            "boost_mode": "multiply",
        }
    }
    return body


def suggest_body(lat: float, lng: float, q: str) -> dict[str, Any]:
    def prefix(field: str) -> dict[str, Any]:
        return {
            "multi_match": {
                "query": q,
                "type": "bool_prefix",
                "fields": [
                    f"{field}.suggest",
                    f"{field}.suggest._2gram",
                    f"{field}.suggest._3gram",
                ],
            }
        }

    return {
        "size": 10,
        "_source": ["id", "name", "logoUrl"],
        "query": {
            "bool": {
                "filter": delivers_to(lat, lng),
                "should": [
                    _named(prefix("name"), "name"),
                    {
                        "nested": {
                            "path": "dishes",
                            "query": prefix("dishes.name"),
                            "inner_hits": {"size": 3, "_source": ["dishes.id", "dishes.name"]},
                        }
                    },
                ],
                "minimum_should_match": 1,
            }
        },
    }


def _named(query: dict[str, Any], name: str) -> dict[str, Any]:
    """The same query, reported in a hit's matched_queries when it matched."""
    [(kind, params)] = query.items()
    return {kind: {**params, "_name": name}}


def cuisines_body(lat: float, lng: float, size: int = 200) -> dict[str, Any]:
    return {
        "size": 0,
        "query": {"bool": {"filter": delivers_to(lat, lng)}},
        "aggs": {"cuisines": {"terms": {"field": "cuisines", "size": size}}},
    }


# --- results ----------------------------------------------------------------------


def _dish(source: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": source["id"],
        "name": source["name"],
        "description": source.get("description"),
        "category": source.get("category", ""),
        "imageUrl": source.get("imageUrl"),
        "pricePaisa": source["pricePaisa"],
        "isAvailable": source["isAvailable"],
    }


def to_result(hit: dict[str, Any], lat: float, lng: float, now: datetime) -> dict[str, Any]:
    """A hit as the contract's SearchResult, with what depends on the point and the time."""
    s = hit["_source"]
    zones = s.get("zones") or []
    # Elasticsearch already matched a zone; ray casting can differ from it right on an edge.
    zone = cheapest_zone(zones, lat, lng) or min(
        zones, key=lambda z: (z["deliveryFeePaisa"], z["minimumOrderPaisa"], z["id"])
    )
    paused_until = s.get("pausedUntil")
    paused = paused_until is not None and datetime.fromisoformat(paused_until) > now
    open_now = is_open_at(s.get("hours") or {}, now)
    dishes = hit.get("inner_hits", {}).get("dishes", {}).get("hits", {}).get("hits", [])
    return {
        "id": s["id"],
        "name": s["name"],
        "cuisines": s["cuisines"],
        "area": s["area"],
        "city": s["city"],
        "logoUrl": s.get("logoUrl"),
        "coverUrl": s.get("coverUrl"),
        "location": s["location"],
        "distanceMeters": round(
            distance_meters(lat, lng, s["location"]["lat"], s["location"]["lng"])
        ),
        "openNow": open_now,
        "pausedUntil": paused_until if paused else None,
        "acceptingOrders": open_now and not paused,
        "rating": s.get("rating") or {"average": None, "count": 0},
        "delivery": {
            "zoneId": zone["id"],
            "deliveryFeePaisa": zone["deliveryFeePaisa"],
            "minimumOrderPaisa": zone["minimumOrderPaisa"],
            "deliveryTimeMinutes": zone["deliveryTimeMinutes"],
        },
        "matchingDishes": [_dish(d["_source"]) for d in dishes],
    }
