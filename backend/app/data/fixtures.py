from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.schemas import Hotspot, Incident, ReplayEvent
from app.services.geo import point_geometry

NSW_BBOX = [148.7, -37.4, 153.8, -31.1]
REPLAY_START = datetime(2020, 1, 4, 0, 0, tzinfo=UTC)
REPLAY_END = datetime(2020, 1, 7, 0, 0, tzinfo=UTC)


def replay_event() -> ReplayEvent:
    return ReplayEvent(
        event_id="nsw-black-summer-south-coast",
        name="NSW Bushfire Replay",
        start_time=REPLAY_START,
        end_time=REPLAY_END,
        region_bbox=NSW_BBOX,
        description=(
            "Historical South Coast NSW replay window. Features are cut off at the selected time; "
            "future hotspots remain hidden until reveal mode."
        ),
    )


def demo_incidents(now: datetime | None = None) -> list[Incident]:
    updated = now or datetime(2026, 1, 15, 3, 0, tzinfo=UTC)
    return [
        Incident(
            id="rfs-south-coast-001",
            name="South Coast Escarpment",
            status="Out of control",
            alert_level="Watch and Act",
            started_at=updated - timedelta(hours=14),
            updated_at=updated,
            lat=-35.33,
            lon=150.24,
            size_hectares=13850,
            source="demo-rfs",
        ),
        Incident(
            id="rfs-snowy-valleys-002",
            name="Snowy Valleys Ridge",
            status="Being controlled",
            alert_level="Advice",
            started_at=updated - timedelta(hours=29),
            updated_at=updated - timedelta(minutes=34),
            lat=-35.84,
            lon=148.19,
            size_hectares=6420,
            source="demo-rfs",
        ),
        Incident(
            id="rfs-hunter-003",
            name="Hunter Range",
            status="Under control",
            alert_level="Advice",
            started_at=updated - timedelta(days=2, hours=6),
            updated_at=updated - timedelta(hours=1),
            lat=-32.54,
            lon=151.12,
            size_hectares=980,
            source="demo-rfs",
        ),
    ]


def replay_hotspots() -> list[Hotspot]:
    seeds = [
        (0, -35.40, 150.02, 0.88, 62),
        (0, -35.32, 150.17, 0.84, 54),
        (6, -35.22, 150.30, 0.91, 71),
        (6, -35.45, 150.24, 0.79, 47),
        (12, -35.08, 150.34, 0.93, 82),
        (12, -35.30, 150.28, 0.86, 66),
        (18, -34.92, 150.46, 0.95, 91),
        (18, -35.10, 150.40, 0.89, 75),
        (24, -34.78, 150.54, 0.96, 104),
        (24, -35.01, 150.48, 0.90, 81),
        (30, -34.63, 150.64, 0.94, 97),
        (30, -34.86, 150.48, 0.87, 69),
        (36, -34.55, 150.58, 0.92, 88),
        (36, -34.72, 150.50, 0.85, 58),
        (48, -34.43, 150.72, 0.83, 52),
        (48, -34.60, 150.60, 0.80, 49),
        (60, -34.31, 150.78, 0.77, 42),
        (60, -34.51, 150.66, 0.74, 39),
        (72, -34.22, 150.84, 0.70, 33),
    ]

    hotspots: list[Hotspot] = []
    for offset_hours, lat, lon, confidence, intensity in seeds:
        observed_at = REPLAY_START + timedelta(hours=offset_hours)
        hotspots.append(
            Hotspot(
                source="demo-firms-dea",
                observed_at=observed_at,
                lat=lat,
                lon=lon,
                confidence=confidence,
                intensity=intensity,
                geometry=point_geometry(lat, lon),
            )
        )
    return hotspots
