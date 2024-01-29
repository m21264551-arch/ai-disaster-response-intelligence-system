from datetime import UTC, datetime
from pathlib import Path
import sys

import pandas as pd

sys.path.append(str(Path(__file__).resolve().parents[1] / "scripts"))

from app.ml.features import FEATURE_COLUMNS, cell_feature_row
from app.schemas import Exposure
from app.services.exposure import estimate_exposure
from app.services.geo import cell_from_lat_lon
from app.services.weather import weather_features_for_cell
from download_bom_weather import parse_bom_daily_csv


def test_bom_daily_csv_parser_normalizes_fire_weather_fields():
    text = """'IDCKWCDE51,,,,,,,,,,
Australian Government Bureau of Meteorology,,,,,,,,,,
Station Name,Date,0000-2400,0900-0900,0900-0900,Maximum,Minimum,Maximum,Minimum,Average,Solar
,,(mm),(mm),(mm),(C),(C),(%),(%),(m/sec),(MJ/sq m)
NOWRA RAN AIR STATION,04/01/2020,10.2,0.0, ,43.2,18.5,100,12,5.34,17.89
"""
    metadata = {
        "nowra ran air station": {
            "station_id": "068072",
            "lat": -34.9469,
            "lon": 150.5353,
        }
    }

    rows = parse_bom_daily_csv(text, state="nsw", station_slug="nowra_ran_air_station", station_metadata=metadata)

    assert rows == [
        {
            "source": "bom-idckwcdea0-ftp",
            "state": "NSW",
            "station_slug": "nowra_ran_air_station",
            "station_id": "068072",
            "station_name": "NOWRA RAN AIR STATION",
            "date": "2020-01-04",
            "lat": -34.9469,
            "lon": 150.5353,
            "evapotranspiration_mm": 10.2,
            "rainfall_mm": 0.0,
            "pan_evaporation_mm": None,
            "max_temp_c": 43.2,
            "min_temp_c": 18.5,
            "max_relative_humidity_pct": 100.0,
            "min_relative_humidity_pct": 12.0,
            "avg_10m_wind_speed_mps": 5.34,
            "avg_10m_wind_speed_kmh": 19.224,
            "solar_radiation_mj_m2": 17.89,
        }
    ]


def test_weather_join_uses_only_completed_observation_days():
    nowra_cell = cell_from_lat_lon(-34.9469, 150.5353, resolution=5)

    features = weather_features_for_cell(nowra_cell, datetime(2020, 1, 5, 12, tzinfo=UTC))

    assert features["weather_observation_age_days"] == 0
    assert features["weather_station_distance_km"] < 60
    assert features["max_temp_c"] >= 40
    assert features["min_relative_humidity_pct"] <= 15


def test_abs_population_overlay_drives_exposure_estimate():
    frame = pd.read_csv(Path("backend/app/data/abs_population_h3_sample.csv"))
    row = frame.sort_values("population", ascending=False).iloc[0]

    exposure = estimate_exposure(str(row["h3_id"]))

    assert exposure.population == round(row["population"])
    assert exposure.population > 100_000


def test_feature_store_contains_weather_and_abs_population_columns():
    h3_id = cell_from_lat_lon(-34.9469, 150.5353, resolution=5)
    row = cell_feature_row(
        cell_id=h3_id,
        prediction_time=datetime(2020, 1, 5, 12, tzinfo=UTC),
        hotspots=[],
        exposure=Exposure(h3_id=h3_id, population=1200, hospitals=1, schools=2, major_roads=1, shelters=1),
        horizon_hours=24,
    )

    assert {"max_temp_c", "rainfall_mm", "avg_10m_wind_speed_kmh", "weather_station_distance_km"}.issubset(
        FEATURE_COLUMNS
    )
    assert row["max_temp_c"] >= 40
    assert row["avg_10m_wind_speed_kmh"] > 10
