from datetime import UTC, datetime

from app.services.risk import recent_hotspots


def test_recent_hotspots_do_not_include_future_observations():
    start_time = datetime(2020, 1, 4, 12, tzinfo=UTC)
    hotspots = recent_hotspots(start_time, [148.7, -37.4, 153.8, -31.1])

    assert hotspots
    assert all(hotspot.observed_at <= start_time for hotspot in hotspots)

