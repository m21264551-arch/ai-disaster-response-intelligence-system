from __future__ import annotations

from datetime import date, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd

from app.services.geo import centroid_from_h3, haversine_km

BOM_WEATHER_PATH = Path(__file__).resolve().parents[1] / "data" / "bom_weather_observations_sample.csv"

DEFAULT_WEATHER_FEATURES = {
    "max_temp_c": 30.0,
    "min_temp_c": 16.0,
    "rainfall_mm": 0.0,
    "max_relative_humidity_pct": 82.0,
    "min_relative_humidity_pct": 38.0,
    "avg_10m_wind_speed_kmh": 18.0,
    "solar_radiation_mj_m2": 22.0,
    "weather_station_distance_km": 999.0,
    "weather_observation_age_days": 99.0,
}


@lru_cache(maxsize=65536)
def weather_features_for_cell(h3_id: str, prediction_time: datetime) -> dict[str, float]:
    frame = load_bom_weather_observations()
    if frame.empty:
        return dict(DEFAULT_WEATHER_FEATURES)

    usable_date = prediction_time.date() - timedelta(days=1)
    candidates = frame[(frame["date"] <= usable_date) & (frame["date"] >= usable_date - timedelta(days=3))]
    if candidates.empty:
        return dict(DEFAULT_WEATHER_FEATURES)

    center = centroid_from_h3(h3_id)
    candidates = candidates.copy()
    candidates["distance_km"] = candidates.apply(
        lambda row: haversine_km(center["lat"], center["lon"], float(row["lat"]), float(row["lon"])),
        axis=1,
    )
    candidates["age_days"] = candidates["date"].map(lambda value: (usable_date - value).days)
    row = candidates.sort_values(["age_days", "distance_km"]).iloc[0]

    return {
        "max_temp_c": _finite_or_default(row.get("max_temp_c"), "max_temp_c"),
        "min_temp_c": _finite_or_default(row.get("min_temp_c"), "min_temp_c"),
        "rainfall_mm": _finite_or_default(row.get("rainfall_mm"), "rainfall_mm"),
        "max_relative_humidity_pct": _finite_or_default(
            row.get("max_relative_humidity_pct"), "max_relative_humidity_pct"
        ),
        "min_relative_humidity_pct": _finite_or_default(
            row.get("min_relative_humidity_pct"), "min_relative_humidity_pct"
        ),
        "avg_10m_wind_speed_kmh": _finite_or_default(
            row.get("avg_10m_wind_speed_kmh"), "avg_10m_wind_speed_kmh"
        ),
        "solar_radiation_mj_m2": _finite_or_default(row.get("solar_radiation_mj_m2"), "solar_radiation_mj_m2"),
        "weather_station_distance_km": min(999.0, float(row["distance_km"])),
        "weather_observation_age_days": min(99.0, float(row["age_days"])),
    }


@lru_cache(maxsize=1)
def load_bom_weather_observations() -> pd.DataFrame:
    if not BOM_WEATHER_PATH.exists():
        return pd.DataFrame()
    return normalize_weather_observations(pd.read_csv(BOM_WEATHER_PATH))


def normalize_weather_observations(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return frame

    normalized = frame.rename(
        columns={
            "station": "station_name",
            "latitude": "lat",
            "longitude": "lon",
            "maximum_temperature_c": "max_temp_c",
            "minimum_temperature_c": "min_temp_c",
            "rain_mm": "rainfall_mm",
            "wind_speed_kmh": "avg_10m_wind_speed_kmh",
            "wind_speed_mps": "avg_10m_wind_speed_mps",
        }
    ).copy()
    required = {"date", "lat", "lon"}
    if not required.issubset(normalized.columns):
        return pd.DataFrame()

    normalized["date"] = pd.to_datetime(normalized["date"], errors="coerce").dt.date
    numeric_columns = [
        "lat",
        "lon",
        "rainfall_mm",
        "max_temp_c",
        "min_temp_c",
        "max_relative_humidity_pct",
        "min_relative_humidity_pct",
        "avg_10m_wind_speed_mps",
        "avg_10m_wind_speed_kmh",
        "solar_radiation_mj_m2",
    ]
    for column in numeric_columns:
        if column not in normalized.columns:
            normalized[column] = pd.NA
        normalized[column] = pd.to_numeric(normalized[column], errors="coerce")

    if normalized["avg_10m_wind_speed_kmh"].isna().all() and "avg_10m_wind_speed_mps" in normalized.columns:
        normalized["avg_10m_wind_speed_kmh"] = normalized["avg_10m_wind_speed_mps"] * 3.6
    else:
        normalized["avg_10m_wind_speed_kmh"] = normalized["avg_10m_wind_speed_kmh"].fillna(
            normalized["avg_10m_wind_speed_mps"] * 3.6
        )

    normalized = normalized.dropna(subset=["date", "lat", "lon"])
    return normalized


def _finite_or_default(value: Any, key: str) -> float:
    numeric = pd.to_numeric(value, errors="coerce")
    if pd.isna(numeric):
        return DEFAULT_WEATHER_FEATURES[key]
    return float(numeric)
