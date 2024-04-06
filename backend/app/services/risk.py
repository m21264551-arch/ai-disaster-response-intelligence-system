from __future__ import annotations

import hashlib
import math
from datetime import UTC, datetime, timedelta

from app.data.fixtures import NSW_BBOX, replay_hotspots
from app.ml.features import baseline_features_for_cell, cell_feature_row, feature_contributions
from app.ml.model_registry import get_trained_model
from app.schemas import Exposure, FeatureContribution, Hotspot, RiskCell
from app.services.exposure import estimate_exposure, infrastructure_weight
from app.services.geo import (
    cells_around,
    centroid_from_h3,
    in_bbox,
    polygon_geometry_from_h3,
)
from app.services.land_mask import h3_cell_inside_land, point_inside_land

MODEL_VERSION = "hist-gradient-bushfire-risk-v1"
FALLBACK_MODEL_VERSION = "bushfire-risk-deterministic-demo-v0.3"
BASELINE_VERSION = "wind-aligned-spread-v0.1"


def stable_noise(key: str, amplitude: float = 0.04) -> float:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    raw = int(digest[:8], 16) / 0xFFFFFFFF
    return (raw - 0.5) * amplitude


def recent_hotspots(start_time: datetime, bbox: list[float], lookback_hours: int = 36) -> list[Hotspot]:
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=UTC)

    window_start = start_time - timedelta(hours=lookback_hours)
    candidates = [
        hotspot
        for hotspot in replay_hotspots()
        if (
            window_start <= hotspot.observed_at <= start_time
            and in_bbox(hotspot.lat, hotspot.lon, bbox)
            and point_inside_land(hotspot.lat, hotspot.lon, bbox)
        )
    ]
    if candidates:
        return candidates

    # Keep the demo useful when the user asks for a date outside the replay window.
    return [hotspot for hotspot in replay_hotspots()[:4] if in_bbox(hotspot.lat, hotspot.lon, NSW_BBOX)]


def candidate_h3_cells(start_time: datetime, bbox: list[float], horizons: list[int], resolution: int = 5) -> set[str]:
    hotspots = recent_hotspots(start_time, bbox)
    max_horizon = max(horizons or [24])
    ring = 2 + int(max_horizon / 24)
    cells: set[str] = set()
    for hotspot in hotspots:
        cells |= cells_around(hotspot.lat, hotspot.lon, resolution=resolution, ring=ring)
    return {
        cell
        for cell in cells
        if (
            in_bbox(centroid_from_h3(cell)["lat"], centroid_from_h3(cell)["lon"], bbox)
            and h3_cell_inside_land(cell, bbox)
        )
    }


def baseline_risk(cell_id: str, hotspots: list[Hotspot], horizon_hours: int) -> tuple[float, dict[str, float]]:
    score, parts = baseline_features_for_cell(cell_id, hotspots, horizon_hours)
    score = max(0.01, min(0.93, score + stable_noise(f"baseline-{cell_id}-{horizon_hours}")))
    return score, parts


def model_risk(
    cell_id: str,
    hotspots: list[Hotspot],
    exposure: Exposure,
    horizon_hours: int,
    prediction_time: datetime,
    trained_score: float | None = None,
) -> RiskCell:
    baseline_score, baseline_features = baseline_risk(cell_id, hotspots, horizon_hours)
    feature_row = cell_feature_row(
        cell_id=cell_id,
        prediction_time=prediction_time,
        hotspots=hotspots,
        exposure=exposure,
        horizon_hours=horizon_hours,
    )
    score = trained_score if trained_score is not None else fallback_model_score(
        cell_id=cell_id,
        horizon_hours=horizon_hours,
        baseline_score=baseline_score,
        exposure=exposure,
        hotspot_count=len(hotspots),
    )
    score = max(0.01, min(0.97, score))

    uncertainty = {24: 0.08, 48: 0.12, 72: 0.16}[horizon_hours]
    top_features = feature_contributions(feature_row, baseline_features)

    return RiskCell(
        h3_id=cell_id,
        horizon_hours=horizon_hours,
        risk_score=round(score, 4),
        confidence_low=round(max(0.0, score - uncertainty), 4),
        confidence_high=round(min(1.0, score + uncertainty), 4),
        top_features=top_features,
        geometry=polygon_geometry_from_h3(cell_id),
        centroid=centroid_from_h3(cell_id),
    )


def predict_risk_cells(start_time: datetime, bbox: list[float], horizons: list[int]) -> tuple[list[RiskCell], list[Exposure]]:
    hotspots = recent_hotspots(start_time, bbox)
    cells = candidate_h3_cells(start_time, bbox, horizons)

    exposures_by_cell = {cell: estimate_exposure(cell) for cell in cells}
    risk_cells: list[RiskCell] = []
    trained_model = get_trained_model()
    for horizon in horizons:
        ordered_cells = sorted(cells)
        trained_scores: dict[str, float] = {}
        if trained_model:
            feature_rows = [
                cell_feature_row(
                    cell_id=cell,
                    prediction_time=start_time,
                    hotspots=hotspots,
                    exposure=exposures_by_cell[cell],
                    horizon_hours=horizon,
                )
                for cell in ordered_cells
            ]
            trained_scores = dict(zip(ordered_cells, trained_model.predict_proba(feature_rows), strict=True))

        horizon_cells = [
            model_risk(
                cell,
                hotspots,
                exposures_by_cell[cell],
                horizon,
                start_time,
                trained_scores.get(cell),
            )
            for cell in ordered_cells
        ]
        risk_cells.extend(sorted(horizon_cells, key=lambda cell: cell.risk_score, reverse=True)[:90])

    used_cells = {cell.h3_id for cell in risk_cells}
    exposures = [exposures_by_cell[cell] for cell in sorted(used_cells)]
    return risk_cells, exposures


def fallback_model_score(
    *,
    cell_id: str,
    horizon_hours: int,
    baseline_score: float,
    exposure: Exposure,
    hotspot_count: int,
) -> float:
    exposed_assets = min(1.0, math.log1p(exposure.population) / 8)
    critical_infra = min(1.0, infrastructure_weight(exposure) / 3.2)
    neighbor_activity = min(1.0, hotspot_count / 12)
    seasonality = 0.92
    score = (
        baseline_score * 0.58
        + exposed_assets * 0.14
        + critical_infra * 0.10
        + neighbor_activity * 0.10
        + seasonality * 0.08
    )
    return score + stable_noise(f"model-{cell_id}-{horizon_hours}", amplitude=0.035)


def active_model_version() -> str:
    trained_model = get_trained_model()
    return trained_model.model_version if trained_model else FALLBACK_MODEL_VERSION
