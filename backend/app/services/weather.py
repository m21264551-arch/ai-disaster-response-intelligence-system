from __future__ import annotations

import csv
from datetime import date, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

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

WeatherObservation = dict[str, float | date | None]


@lru_cache(maxsize=65536)
def weather_features_for_cell(h3_id: str, prediction_time: datetime) -> dict[str, float]:
    observations = load_bom_weather_observations()
    if not observations:
        return dict(DEFAULT_WEATHER_FEATURES)

    usable_date = prediction_time.date() - timedelta(days=1)
    window_start = usable_date - timedelta(days=3)
    candidates = [
        observation
        for observation in observations
        if window_start <= observation["date"] <= usable_date
    ]
    if not candidates:
        return dict(DEFAULT_WEATHER_FEATURES)

    center = centroid_from_h3(h3_id)
    best_row: WeatherObservation | None = None
    best_sort_key: tuple[int, float] | None = None
    for observation in candidates:
        age_days = (usable_date - observation["date"]).days
        distance_km = haversine_km(
            center["lat"],
            center["lon"],
            float(observation["lat"]),
            float(observation["lon"]),
        )
        sort_key = (age_days, distance_km)
        if best_sort_key is None or sort_key < best_sort_key:
            best_sort_key = sort_key
            best_row = {**observation, "distance_km": distance_km, "age_days": age_days}

    if best_row is None:
        return dict(DEFAULT_WEATHER_FEATURES)

    return {
        "max_temp_c": _finite_or_default(best_row.get("max_temp_c"), "max_temp_c"),
        "min_temp_c": _finite_or_default(best_row.get("min_temp_c"), "min_temp_c"),
        "rainfall_mm": _finite_or_default(best_row.get("rainfall_mm"), "rainfall_mm"),
        "max_relative_humidity_pct": _finite_or_default(
            best_row.get("max_relative_humidity_pct"), "max_relative_humidity_pct"
        ),
        "min_relative_humidity_pct": _finite_or_default(
            best_row.get("min_relative_humidity_pct"), "min_relative_humidity_pct"
        ),
        "avg_10m_wind_speed_kmh": _finite_or_default(
            best_row.get("avg_10m_wind_speed_kmh"), "avg_10m_wind_speed_kmh"
        ),
        "solar_radiation_mj_m2": _finite_or_default(best_row.get("solar_radiation_mj_m2"), "solar_radiation_mj_m2"),
        "weather_station_distance_km": min(999.0, float(best_row["distance_km"])),
        "weather_observation_age_days": min(99.0, float(best_row["age_days"])),
    }


@lru_cache(maxsize=1)
def load_bom_weather_observations() -> tuple[WeatherObservation, ...]:
    if not BOM_WEATHER_PATH.exists():
        return ()

    records: list[WeatherObservation] = []
    with BOM_WEATHER_PATH.open(newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            normalized = normalize_weather_observation(row)
            if normalized is not None:
                records.append(normalized)
    return tuple(records)


def normalize_weather_observation(row: dict[str, Any]) -> WeatherObservation | None:
    observed_date = _parse_date(row.get("date"))
    lat = _parse_float(row.get("latitude") or row.get("lat"))
    lon = _parse_float(row.get("longitude") or row.get("lon"))
    if observed_date is None or lat is None or lon is None:
        return None

    wind_kmh = _parse_float(row.get("wind_speed_kmh") or row.get("avg_10m_wind_speed_kmh"))
    if wind_kmh is None:
        wind_mps = _parse_float(row.get("wind_speed_mps") or row.get("avg_10m_wind_speed_mps"))
        wind_kmh = wind_mps * 3.6 if wind_mps is not None else None

    return {
        "date": observed_date,
        "lat": lat,
        "lon": lon,
        "rainfall_mm": _parse_float(row.get("rain_mm") or row.get("rainfall_mm")),
        "max_temp_c": _parse_float(row.get("maximum_temperature_c") or row.get("max_temp_c")),
        "min_temp_c": _parse_float(row.get("minimum_temperature_c") or row.get("min_temp_c")),
        "max_relative_humidity_pct": _parse_float(row.get("max_relative_humidity_pct")),
        "min_relative_humidity_pct": _parse_float(row.get("min_relative_humidity_pct")),
        "avg_10m_wind_speed_kmh": wind_kmh,
        "solar_radiation_mj_m2": _parse_float(row.get("solar_radiation_mj_m2")),
    }


def _finite_or_default(value: Any, key: str) -> float:
    numeric = _parse_float(value)
    return DEFAULT_WEATHER_FEATURES[key] if numeric is None else numeric


def _parse_date(value: Any) -> date | None:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if value is None:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _parse_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if numeric != numeric:
        return None
    return numeric
