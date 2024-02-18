from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx

from app.config import Settings
from app.data.fixtures import demo_incidents
from app.schemas import Incident


async def fetch_nsw_rfs_incidents(settings: Settings) -> list[Incident]:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(settings.nsw_rfs_incidents_url)
            response.raise_for_status()
            payload = response.json()
        return parse_nsw_rfs_incidents(payload)
    except Exception:
        return demo_incidents()


def parse_nsw_rfs_incidents(payload: Any) -> list[Incident]:
    if not isinstance(payload, dict):
        return demo_incidents()

    raw_features = payload.get("features", [])
    if not isinstance(raw_features, list):
        return demo_incidents()

    incidents: list[Incident] = []
    for index, feature in enumerate(raw_features[:20]):
        if not isinstance(feature, dict):
            continue
        props = feature.get("properties", {})
        geometry = feature.get("geometry", {})
        props = props if isinstance(props, dict) else {}
        geometry = geometry if isinstance(geometry, dict) else {}
        coordinates = geometry.get("coordinates") or [151.2093, -33.8688]
        if not isinstance(coordinates, list | tuple) or len(coordinates) < 2:
            continue
        lon = _float_or_default(coordinates[0], 151.2093)
        lat = _float_or_default(coordinates[1], -33.8688)
        updated = datetime.now(UTC)
        incidents.append(
            Incident(
                id=str(props.get("guid") or props.get("id") or f"rfs-live-{index}"),
                name=str(props.get("title") or props.get("name") or "NSW RFS Incident"),
                status=str(props.get("status") or props.get("category") or "Unknown"),
                alert_level=str(props.get("alert_level") or props.get("alertLevel") or "Advice"),
                started_at=updated,
                updated_at=updated,
                lat=lat,
                lon=lon,
                size_hectares=max(0.0, _float_or_default(props.get("size") or props.get("area"), 0.0)),
                source="nsw-rfs-live",
            )
        )
    return incidents or demo_incidents()


def _float_or_default(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default
