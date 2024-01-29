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
    except Exception:
        return demo_incidents()

    features: list[dict[str, Any]] = payload.get("features", [])
    incidents: list[Incident] = []
    for index, feature in enumerate(features[:20]):
        props = feature.get("properties", {})
        geometry = feature.get("geometry", {})
        coordinates = geometry.get("coordinates") or [151.2093, -33.8688]
        lon, lat = coordinates[:2]
        updated = datetime.now(UTC)
        incidents.append(
            Incident(
                id=str(props.get("guid") or props.get("id") or f"rfs-live-{index}"),
                name=str(props.get("title") or props.get("name") or "NSW RFS Incident"),
                status=str(props.get("status") or props.get("category") or "Unknown"),
                alert_level=str(props.get("alert_level") or props.get("alertLevel") or "Advice"),
                started_at=updated,
                updated_at=updated,
                lat=float(lat),
                lon=float(lon),
                size_hectares=float(props.get("size") or props.get("area") or 0),
                source="nsw-rfs-live",
            )
        )
    return incidents or demo_incidents()

