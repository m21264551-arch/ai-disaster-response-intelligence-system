from pathlib import Path

from app.ml.dataset import build_training_frame, read_hotspots_csv


def test_training_dataset_has_temporal_labels():
    hotspots = read_hotspots_csv(Path("backend/app/data/historical_hotspots_sample.csv"))
    frame = build_training_frame(hotspots, horizons=(24,), step_hours=12)

    assert {"prediction_time", "h3_id", "label", "baseline_score"}.issubset(frame.columns)
    assert frame["label"].nunique() == 2
    assert frame["prediction_time"].is_monotonic_increasing
