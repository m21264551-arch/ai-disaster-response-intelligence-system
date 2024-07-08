from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pandas as pd

from app.ml.features import FEATURE_COLUMNS, baseline_features_for_cell, cell_feature_row
from app.schemas import Hotspot
from app.services.exposure import estimate_exposure
from app.services.geo import cell_from_lat_lon, cells_around, point_geometry


def read_hotspots_csv(path: Path) -> list[Hotspot]:
    frame = pd.read_csv(path)
    return normalize_hotspot_frame(frame)


def normalize_hotspot_frame(frame: pd.DataFrame) -> list[Hotspot]:
    renamed = frame.rename(
        columns={
            "latitude": "lat",
            "longitude": "lon",
            "datetime": "observed_at",
            "acq_date": "date",
            "acq_time": "time",
            "frp": "intensity",
            "power": "intensity",
            "brightness": "brightness",
            "bright_ti4": "brightness",
        }
    ).copy()

    if "observed_at" not in renamed.columns and {"date", "time"}.issubset(renamed.columns):
        times = renamed["time"].astype(str).str.zfill(4)
        renamed["observed_at"] = renamed["date"].astype(str) + "T" + times.str[:2] + ":" + times.str[2:] + ":00Z"

    if "intensity" not in renamed.columns:
        if "brightness" in renamed.columns:
            renamed["intensity"] = (renamed["brightness"].astype(float) - 280).clip(lower=0)
        else:
            renamed["intensity"] = 1.0

    if "confidence" not in renamed.columns:
        renamed["confidence"] = 50

    if "source" not in renamed.columns:
        renamed["source"] = "historical-hotspot-csv"

    hotspots: list[Hotspot] = []
    for row in renamed.to_dict("records"):
        lat = float(row["lat"])
        lon = float(row["lon"])
        confidence = _normalize_confidence(row.get("confidence", 50))
        observed_at = pd.Timestamp(row["observed_at"]).to_pydatetime()
        if observed_at.tzinfo is None:
            observed_at = observed_at.replace(tzinfo=UTC)
        hotspots.append(
            Hotspot(
                source=str(row.get("source") or "historical-hotspot-csv"),
                observed_at=observed_at,
                lat=lat,
                lon=lon,
                confidence=confidence,
                intensity=max(0.0, float(row.get("intensity") or 0.0)),
                geometry=point_geometry(lat, lon),
            )
        )
    return sorted(hotspots, key=lambda item: item.observed_at)


def build_training_frame(
    hotspots: list[Hotspot],
    *,
    horizons: tuple[int, ...] = (24, 48, 72),
    lookback_hours: int = 36,
    step_hours: int = 6,
    candidate_ring: int = 4,
) -> pd.DataFrame:
    if len(hotspots) < 12:
        raise ValueError("Need at least 12 hotspots to build a temporal training dataset")

    start = min(hotspot.observed_at for hotspot in hotspots) + timedelta(hours=lookback_hours)
    end = max(hotspot.observed_at for hotspot in hotspots) - timedelta(hours=max(horizons))
    if start >= end:
        raise ValueError("Hotspot window is too short for the requested lookback and horizons")

    records: list[dict[str, float | int | str]] = []
    prediction_time = start
    while prediction_time <= end:
        recent = [
            hotspot
            for hotspot in hotspots
            if prediction_time - timedelta(hours=lookback_hours) <= hotspot.observed_at <= prediction_time
        ]
        if not recent:
            prediction_time += timedelta(hours=step_hours)
            continue

        active_cells = {cell_from_lat_lon(hotspot.lat, hotspot.lon, resolution=5) for hotspot in recent}
        candidate_cells: set[str] = set()
        for active_cell in active_cells:
            candidate_cells |= set(cells_around(*_cell_lat_lon(active_cell), resolution=5, ring=candidate_ring))

        for horizon in horizons:
            future = [
                hotspot
                for hotspot in hotspots
                if prediction_time < hotspot.observed_at <= prediction_time + timedelta(hours=horizon)
            ]
            future_cells = {cell_from_lat_lon(hotspot.lat, hotspot.lon, resolution=5) for hotspot in future}

            for cell_id in candidate_cells:
                exposure = estimate_exposure(cell_id)
                features = cell_feature_row(
                    cell_id=cell_id,
                    prediction_time=prediction_time,
                    hotspots=recent,
                    exposure=exposure,
                    horizon_hours=horizon,
                )
                baseline_score, _ = baseline_features_for_cell(cell_id, recent, horizon)
                features.update(
                    {
                        "label": int(cell_id in future_cells),
                        "prediction_time": prediction_time.isoformat(),
                        "h3_id": cell_id,
                        "baseline_score_raw": baseline_score,
                    }
                )
                records.append(features)

        prediction_time += timedelta(hours=step_hours)

    frame = pd.DataFrame(records)
    if frame.empty or frame["label"].nunique() < 2:
        raise ValueError("Training frame needs both positive and negative labels")
    return frame


def _cell_lat_lon(cell_id: str) -> tuple[float, float]:
    from app.services.geo import centroid_from_h3

    center = centroid_from_h3(cell_id)
    return center["lat"], center["lon"]


def _normalize_confidence(value: object) -> float:
    if isinstance(value, str):
        lowered = value.lower()
        if lowered == "low":
            return 0.3
        if lowered == "nominal":
            return 0.6
        if lowered == "high":
            return 0.9
    numeric = float(value)
    return numeric / 100 if numeric > 1 else numeric
