from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request

from app.index import SearchIndex

router = APIRouter()

Lat = Annotated[float, Query(ge=-90, le=90, description="Where to deliver")]
Lng = Annotated[float, Query(ge=-180, le=180)]
Text = Annotated[str, Query(min_length=1, max_length=100)]


def get_index(request: Request) -> SearchIndex:
    return request.app.state.index


Index = Annotated[SearchIndex, Depends(get_index)]


@router.get("/restaurants")
def search_restaurants(
    index: Index,
    lat: Lat,
    lng: Lng,
    q: Annotated[str | None, Query(min_length=1, max_length=100)] = None,
    cuisine: Annotated[str | None, Query(max_length=50)] = None,
    sort: Literal["relevance", "distance", "rating"] = "relevance",
    page: Annotated[int, Query(ge=1, le=50)] = 1,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> dict:
    q = q.strip() if q else None
    cuisine = cuisine.strip().lower() if cuisine else None
    return index.search(lat, lng, q or None, cuisine or None, sort, page, limit)


@router.get("/suggest")
def suggest(index: Index, lat: Lat, lng: Lng, q: Text) -> dict:
    return index.suggest(lat, lng, q)


@router.get("/cuisines")
def cuisines(index: Index, lat: Lat, lng: Lng) -> list[dict]:
    return index.cuisines(lat, lng)
