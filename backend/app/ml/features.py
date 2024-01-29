from __future__ import annotations

import math
from datetime import datetime

from app.schemas import Exposure, FeatureContribution, Hotspot
from app.services.exposure import infrastructure_weight
from app.services.geo import (
    angular_alignment,
    bearing_degrees,
    cells_around,
    centroid_from_h3,
    haversine_km,
)
from app.services.weather import weather_features_for_cell

SPREAD_BEARING_DEGREES = 128.0

FEATURE_COLUMNS = [
    "horizon_hours",
    "recent_hotspot_count",
    "recent_unique_cells",
    "recent_max_intensity",
    "recent_mean_confidence",
    "hours_since_last_hotspot",
    "nearest_fire_km",
    "wind_alignment",
    "neighbor_recent_count",
    "baseline_score",
    "population",
    "hospitals",
    "schools",
    "major_roads",
    "infrastructure_weight",
    "max_temp_c",
    "min_temp_c",
    "rainfall_mm",
    "max_relative_humidity_pct",
    "min_relative_humidity_pct",
    "avg_10m_wind_speed_kmh",
    "solar_radiation_mj_m2",
    "weather_station_distance_km",
    "weather_observation_age_days",
    "month_sin",
    "month_cos",
    "hour_sin",
    "hour_cos",
]


def temporal_features(prediction_time: datetime) -> dict[str, float]:
    month_angle = 2 * math.pi * prediction_time.month / 12
    hour_angle = 2 * math.pi * prediction_time.hour / 24
    return {
        "month_sin": math.sin(month_angle),
        "month_cos": math.cos(month_angle),
        "hour_sin": math.sin(hour_angle),
        "hour_cos": math.cos(hour_angle),
    }


def baseline_features_for_cell(
    cell_id: str,
    hotspots: list[Hotspot],
    horizon_hours: int,
) -> tuple[float, dict[str, float]]:
    center = centroid_from_h3(cell_id)
    distance_scores = []
    alignment_scores = []
    intensity_scores = []
    distances = []

    for hotspot in hotspots:
        distance = haversine_km(hotspot.lat, hotspot.lon, center["lat"], center["lon"])
        spread_range = 18 + horizon_hours * 0.95
        distance_score = math.exp(-(distance / spread_range) ** 2)
        bearing = bearing_degrees(hotspot.lat, hotspot.lon, center["lat"], center["lon"])
        alignment = angular_alignment(bearing, SPREAD_BEARING_DEGREES)
        intensity = min(1.0, hotspot.intensity / 110)
        distances.append(distance)
        distance_scores.append(distance_score)
        alignment_scores.append(alignment)
        intensity_scores.append(intensity)

    recency_intensity = max(intensity_scores or [0])
    nearest_fire = max(distance_scores or [0])
    wind_alignment = max(alignment_scores or [0])
    nearest_fire_km = min(distances or [999.0])
    horizon_factor = {24: 0.82, 48: 0.92, 72: 1.0}[horizon_hours]
    score = nearest_fire * (0.48 + wind_alignment * 0.34 + recency_intensity * 0.18) * horizon_factor
    return max(0.01, min(0.93, score)), {
        "nearest_fire": nearest_fire,
        "nearest_fire_km": nearest_fire_km,
        "wind_alignment": wind_alignment,
        "recency_intensity": recency_intensity,
    }


def cell_feature_row(
    *,
    cell_id: str,
    prediction_time: datetime,
    hotspots: list[Hotspot],
    exposure: Exposure,
    horizon_hours: int,
) -> dict[str, float]:
    baseline_score, baseline_parts = baseline_features_for_cell(cell_id, hotspots, horizon_hours)
    recent_cells = [hotspot_h3 for hotspot_h3 in _hotspot_cells(hotspots)]
    neighbor_cells = set(cells_around(*centroid_from_h3(cell_id).values(), resolution=5, ring=1))
    neighbor_recent_count = sum(1 for recent_cell in recent_cells if recent_cell in neighbor_cells)
    last_observed_at = max((hotspot.observed_at for hotspot in hotspots), default=prediction_time)
    hours_since_last = max(0.0, (prediction_time - last_observed_at).total_seconds() / 3600)
    weather = weather_features_for_cell(cell_id, prediction_time)

    row = {
        "horizon_hours": float(horizon_hours),
        "recent_hotspot_count": float(len(hotspots)),
        "recent_unique_cells": float(len(set(recent_cells))),
        "recent_max_intensity": max((hotspot.intensity for hotspot in hotspots), default=0.0),
        "recent_mean_confidence": _mean([hotspot.confidence for hotspot in hotspots]),
        "hours_since_last_hotspot": min(240.0, hours_since_last),
        "nearest_fire_km": min(500.0, baseline_parts["nearest_fire_km"]),
        "wind_alignment": baseline_parts["wind_alignment"],
        "neighbor_recent_count": float(neighbor_recent_count),
        "baseline_score": baseline_score,
        "population": float(exposure.population),
        "hospitals": float(exposure.hospitals),
        "schools": float(exposure.schools),
        "major_roads": float(exposure.major_roads),
        "infrastructure_weight": infrastructure_weight(exposure),
        "max_temp_c": weather["max_temp_c"],
        "min_temp_c": weather["min_temp_c"],
        "rainfall_mm": weather["rainfall_mm"],
        "max_relative_humidity_pct": weather["max_relative_humidity_pct"],
        "min_relative_humidity_pct": weather["min_relative_humidity_pct"],
        "avg_10m_wind_speed_kmh": weather["avg_10m_wind_speed_kmh"],
        "solar_radiation_mj_m2": weather["solar_radiation_mj_m2"],
        "weather_station_distance_km": weather["weather_station_distance_km"],
        "weather_observation_age_days": weather["weather_observation_age_days"],
    }
    row.update(temporal_features(prediction_time))
    return {column: row[column] for column in FEATURE_COLUMNS}


def feature_contributions(row: dict[str, float], baseline_parts: dict[str, float] | None = None) -> list[FeatureContribution]:
    hot_dry_weather = min(
        1.0,
        max(0.0, (row["max_temp_c"] - 25) / 20) * max(0.0, 1 - row["min_relative_humidity_pct"] / 100),
    )
    signals = [
        FeatureContribution(name="baseline spread score", contribution=min(1.0, row["baseline_score"])),
        FeatureContribution(name="nearby active fire", contribution=max(0.0, 1 - row["nearest_fire_km"] / 160)),
        FeatureContribution(name="neighboring-cell activity", contribution=min(1.0, row["neighbor_recent_count"] / 10)),
        FeatureContribution(name="recent hotspot intensity", contribution=min(1.0, row["recent_max_intensity"] / 110)),
        FeatureContribution(name="exposed population", contribution=min(1.0, math.log1p(row["population"]) / 8)),
        FeatureContribution(name="critical infrastructure", contribution=min(1.0, row["infrastructure_weight"] / 3.2)),
        FeatureContribution(name="hot dry weather", contribution=hot_dry_weather),
        FeatureContribution(name="wind speed", contribution=min(1.0, row["avg_10m_wind_speed_kmh"] / 60)),
    ]
    if baseline_parts:
        signals.append(FeatureContribution(name="wind alignment", contribution=baseline_parts["wind_alignment"]))
    return sorted(signals, key=lambda item: item.contribution, reverse=True)[:3]


def _hotspot_cells(hotspots: list[Hotspot]) -> list[str]:
    from app.services.geo import cell_from_lat_lon

    return [cell_from_lat_lon(hotspot.lat, hotspot.lon, resolution=5) for hotspot in hotspots]


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0
