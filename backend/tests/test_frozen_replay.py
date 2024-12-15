import copy
import json
import math
import shutil
import numpy as np
import pandas as pd
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.main import app
from app.replay import store
from app.replay.pipeline import (
    DATA,
    FEATURES,
    HORIZONS,
    coverage_available,
    eligible_training,
    evaluate,
    forecast_features,
    read_snapshot,
    read_weather,
    select_top,
    weather_at,
)


def test_complete_snapshot_receipts_and_checksums():
    for name in ["training", "evaluation"]:
        observations, manifest = read_snapshot(DATA / f"replay_{name}_dea.csv")
        assert (
            len(observations)
            == manifest["rows"]
            == sum(c["matched"] for c in manifest["chunks"])
        )
        assert len(manifest["chunks"]) == 24
        assert observations.id.is_unique
        assert all(c["matched"] == c["downloaded"] for c in manifest["chunks"])


def test_timestamp_groups_and_maximum_horizon_purge():
    times = pd.to_datetime(
        ["2020-01-06T12:00Z", "2020-01-07T00:00Z", "2020-01-10T00:00Z"]
    )
    frame = pd.DataFrame(
        [
            {"cutoff": t.isoformat(), "horizon": h, "h3_id": c}
            for t in times
            for h in HORIZONS
            for c in ["a", "b"]
        ]
    )
    eligible = eligible_training(frame, pd.Timestamp("2020-01-10T00:00Z"))
    assert len(eligible) == 6
    assert eligible.cutoff.nunique() == 1
    assert set(eligible.horizon) == set(HORIZONS)
    data = store.bundle()
    assert data["training"]["lastOutcomeEnd"] < data["training"]["eventEvaluationStart"]
    assert set(data["training"]["cutoffs"]).isdisjoint(
        f["cutoff"] for f in data["frames"]
    )


def test_future_detections_cannot_change_candidates_features_or_budget():
    cutoff = pd.Timestamp("2020-01-11T12:00Z")
    observations, _ = read_snapshot(DATA / "replay_evaluation_dea.csv")
    earlier = observations.loc[observations.time <= cutoff].iloc[::20].copy()
    later = observations.loc[observations.time > cutoff].iloc[::20].copy()
    later["lat"] = -34.9
    later["lon"] = 151.1
    one = pd.DataFrame(forecast_features(earlier, read_weather(), cutoff))
    two = pd.DataFrame(
        forecast_features(pd.concat([earlier, later]), read_weather(), cutoff)
    )
    pd.testing.assert_frame_equal(one, two)


def test_weather_uses_only_available_observations_and_keeps_missing_values():
    cutoff = pd.Timestamp("2020-01-11T12:00Z")
    weather = read_weather()
    values, available = weather_at(weather, cutoff, -35, 150)
    assert pd.Timestamp(available) <= cutoff
    assert values["weather_age_hours"] >= 48
    future = weather.loc[weather.available_at > cutoff]
    values, available = weather_at(future, cutoff, -35, 150)
    assert available is None and all(np.isnan(v) for v in values.values())


def test_selection_independent_of_future_and_ties_are_stable():
    f = next(f for f in store.bundle()["frames"] if f["available"])
    before = select_top(f["cells"])
    assert len(before) == math.ceil(len(f["cells"]) * 0.1)
    evaluate(f["cells"], [], before)
    evaluate(f["cells"], [c["h3_id"] for c in f["cells"]], before)
    assert before == select_top(f["cells"])
    tied = [{**c, "score": 0.5} for c in f["cells"]]
    assert select_top(tied) == sorted(c["h3_id"] for c in tied)[: len(before)]


def test_no_coverage_is_not_a_zero_outcome():
    meta = {"start": "2020-01-10T00:00:00Z", "end": "2020-01-16T00:00:00Z"}
    assert coverage_available(pd.Timestamp("2020-01-11T12:00Z"), 72, meta)
    assert not coverage_available(pd.Timestamp("2020-01-13T00:00Z"), 72, meta)
    b = store.bundle()
    key = next(f for f in b["frames"] if not f["available"])
    with pytest.raises(HTTPException) as e:
        store.find_frame(frame_id=key["id"])
    assert e.value.status_code == 409
    assert "cells" not in key and "benchmarks" not in key


def test_frozen_scores_reproduce_from_the_serialized_model():
    import joblib

    b = store.bundle()
    frame = next(f for f in b["frames"] if f["available"])
    observations, _ = read_snapshot(DATA / "replay_evaluation_dea.csv")
    features = pd.DataFrame(
        forecast_features(observations, read_weather(), pd.Timestamp(frame["cutoff"]))
    )
    features = features.loc[features.horizon == frame["horizon"]]
    frozen = joblib.load(store.DIRECTORY / "model.joblib")
    assert frozen["modelArtifactId"] == frame["modelArtifactId"]
    scores = frozen["model"].predict_proba(features[FEATURES])[:, 1]
    np.testing.assert_allclose(
        scores, [c["score"] for c in frame["cells"]], rtol=0, atol=1e-14
    )


def test_frame_and_reveal_share_identity_horizon_and_all_candidates():
    client = TestClient(app)
    b = store.bundle()
    for h in HORIZONS:
        key = next(f for f in b["frames"] if f["available"] and f["horizon"] == h)
        request = {"frame_id": key["id"], "artifact_id": b["artifactId"]}
        frame = client.post("/dashboard/frame", json=request).json()
        outcome = client.post("/reveal", json=request).json()
        for field in [
            "modelArtifactId",
            "datasetId",
            "candidateSetId",
            "cutoff",
            "horizon",
        ]:
            assert frame[field] == outcome[field]
        assert len(frame["cells"]) == outcome["summary"]["candidateCount"]
        assert all(c["horizon"] == h for c in frame["cells"])
        assert "actualCells" not in frame and "benchmarks" not in frame
        assert outcome["summary"] == evaluate(
            key["cells"], key["actualCells"], key["selectedCells"]
        )
        assert outcome["summary"]["hits"] + outcome["summary"]["falseAlarms"] == len(
            key["selectedCells"]
        )
        assert outcome["summary"]["coveredObservedCells"] + outcome["summary"][
            "misses"
        ] == len(key["actualCells"])
    assert (
        client.post(
            "/dashboard/frame", json={**request, "artifact_id": "stale"}
        ).status_code
        == 409
    )
    assert client.get("/incidents/current").status_code == 404
    assert client.post("/allocate", json={}).status_code == 404


def test_mismatched_or_missing_artifacts_fail_closed(tmp_path, monkeypatch):
    b = copy.deepcopy(store.bundle())
    b["frames"][0]["modelArtifactId"] = "different-model"
    (tmp_path / "replay-v2.json").write_text(json.dumps(b))
    shutil.copyfile(store.DIRECTORY / "model.joblib", tmp_path / "model.joblib")
    monkeypatch.setattr(store, "DIRECTORY", tmp_path)
    with pytest.raises(HTTPException) as e:
        store.bundle()
    assert e.value.status_code == 503
    (tmp_path / "model.joblib").unlink()
    with pytest.raises(HTTPException) as e:
        store.bundle()
    assert e.value.status_code == 503
