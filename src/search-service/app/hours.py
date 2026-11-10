"""
Opening hours, as restaurant-service decides them (src/hours/hours.ts there):
weekly ranges in Asia/Karachi time, special days replacing them, and ranges
that close after midnight counting towards the next morning.
"""

from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

TIME_ZONE = ZoneInfo("Asia/Karachi")
MINUTES_PER_DAY = 24 * 60
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]  # date.weekday() order


def _minutes(hhmm: str) -> int:
    return int(hhmm[:2]) * 60 + int(hhmm[3:5])


def _span(r: dict[str, str]) -> tuple[int, int]:
    """Minutes after the start of the opening day; the end passes 1440 past midnight."""
    start, end = _minutes(r["opens"]), _minutes(r["closes"])
    return start, end + MINUTES_PER_DAY if end <= start else end


def ranges_on(hours: dict[str, Any], day: date) -> list[dict[str, str]]:
    iso = day.isoformat()
    for special in hours.get("special") or []:
        if special["startsOn"] <= iso <= special["endsOn"]:
            return special["ranges"]
    return (hours.get("weekly") or {}).get(DAYS[day.weekday()]) or []


def is_open_at(hours: dict[str, Any], at: datetime) -> bool:
    local = at.astimezone(TIME_ZONE)
    minutes = local.hour * 60 + local.minute
    today = local.date()
    for r in ranges_on(hours, today):
        start, end = _span(r)
        if start <= minutes < end:
            return True
    return any(
        minutes < _span(r)[1] - MINUTES_PER_DAY for r in ranges_on(hours, today - timedelta(days=1))
    )
