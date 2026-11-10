from datetime import datetime
from zoneinfo import ZoneInfo

from app.hours import is_open_at

# 2026-11-10 is a Tuesday. Karachi is UTC+5.
LUNCH = {"weekly": {"tue": [{"opens": "12:00", "closes": "15:00"}]}, "special": []}
LATE = {"weekly": {"mon": [{"opens": "18:00", "closes": "02:00"}]}, "special": []}


def karachi(day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 11, day, hour, minute, tzinfo=ZoneInfo("Asia/Karachi"))


def test_weekly_ranges_in_karachi_time() -> None:
    assert is_open_at(LUNCH, karachi(10, 12, 0))
    assert is_open_at(LUNCH, karachi(10, 14, 59))
    assert not is_open_at(LUNCH, karachi(10, 15, 0))
    assert not is_open_at(LUNCH, karachi(10, 11, 59))
    assert not is_open_at(LUNCH, karachi(11, 13, 0))  # Wednesday


def test_ranges_past_midnight_count_for_the_next_morning() -> None:
    assert is_open_at(LATE, karachi(9, 23, 0))  # Monday night
    assert is_open_at(LATE, karachi(10, 1, 30))  # Tuesday, from Monday's range
    assert not is_open_at(LATE, karachi(10, 2, 0))
    assert not is_open_at(LATE, karachi(10, 19, 0))  # Tuesday has no hours


def test_special_hours_replace_the_weekday() -> None:
    ramadan = {
        **LUNCH,
        "special": [
            {
                "name": "Ramadan",
                "startsOn": "2026-11-10",
                "endsOn": "2026-11-12",
                "ranges": [{"opens": "17:00", "closes": "03:00"}],
            }
        ],
    }
    assert not is_open_at(ramadan, karachi(10, 13, 0))
    assert is_open_at(ramadan, karachi(10, 18, 0))
    assert is_open_at(ramadan, karachi(11, 2, 0))


def test_24_hours() -> None:
    always = {"weekly": {"tue": [{"opens": "00:00", "closes": "24:00"}]}, "special": []}
    assert is_open_at(always, karachi(10, 0, 0))
    assert is_open_at(always, karachi(10, 23, 59))


def test_no_hours_is_closed() -> None:
    assert not is_open_at({}, karachi(10, 12, 0))
