from pathlib import Path

from app.ml.dataset import build_training_frame, read_hotspots_csv
from app.schemas import Hotspot
from app.services.geo import cell_from_lat_lon, point_geometry


def test_training_dataset_has_temporal_labels():
    hotspots = read_hotspots_csv(Path("backend/app/data/historical_hotspots_sample.csv"))
    frame = build_training_frame(hotspots, horizons=(24,), step_hours=12)

    assert {"prediction_time", "h3_id", "label", "baseline_score"}.issubset(frame.columns)
    assert frame["label"].nunique() == 2
    assert frame["prediction_time"].is_monotonic_increasing


def test_training_dataset_does_not_add_future_only_candidate_cells():
    from datetime import UTC, datetime, timedelta

    base_time = datetime(2020, 1, 1, tzinfo=UTC)

    def hotspot(hours: int, lat: float, lon: float) -> Hotspot:
        return Hotspot(
            source="synthetic",
            observed_at=base_time + timedelta(hours=hours),
            lat=lat,
            lon=lon,
            confidence=0.8,
            intensity=55,
            geometry=point_geometry(lat, lon),
        )

    hotspots = [
        hotspot(0, -35.0, 150.0),
        hotspot(8, -35.01, 150.0),
        hotspot(16, -35.0, 150.01),
        hotspot(28, -35.02, 150.01),
        hotspot(48, -35.01, 150.02),
        hotspot(48, -31.0, 153.0),
        hotspot(64, -35.02, 150.02),
        hotspot(72, -35.03, 150.02),
        hotspot(80, -35.04, 150.02),
        hotspot(88, -35.05, 150.02),
        hotspot(96, -35.06, 150.02),
        hotspot(104, -35.07, 150.02),
    ]

    frame = build_training_frame(hotspots, horizons=(24,), lookback_hours=36, step_hours=12, candidate_ring=1)
    outside_future_cell = cell_from_lat_lon(-31.0, 153.0, resolution=5)
    first_prediction_time = (base_time + timedelta(hours=36)).isoformat()
    first_prediction_rows = frame[frame["prediction_time"] == first_prediction_time]

    assert frame["label"].nunique() == 2
    assert outside_future_cell not in set(first_prediction_rows["h3_id"])
