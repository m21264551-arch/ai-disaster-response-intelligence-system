from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.legacy_demo import app
from app.services.live_feeds import parse_nsw_rfs_incidents


client = TestClient(app)


def test_predict_returns_risk_cells_and_exposures():
    response = client.post(
        "/predict",
        json={
            "bbox": [148.7, -37.4, 153.8, -31.1],
            "start_time": datetime(2020, 1, 5, tzinfo=UTC).isoformat(),
            "horizons": [24, 48, 72],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["prediction_run_id"].startswith("pred-")
    assert len(payload["risk_cells"]) > 50
    assert {cell["horizon_hours"] for cell in payload["risk_cells"]} == {24, 48, 72}
    assert len(payload["exposures"]) > 10
    assert payload["model_version"]


def test_dashboard_bootstrap_returns_core_dashboard_payload():
    response = client.post(
        "/dashboard/bootstrap",
        json={
            "bbox": [148.7, -37.4, 153.8, -31.1],
            "start_time": datetime(2020, 1, 5, tzinfo=UTC).isoformat(),
            "horizons": [24, 48, 72],
            "event_id": "nsw-black-summer-south-coast",
            "hotspot_start": datetime(2020, 1, 4, tzinfo=UTC).isoformat(),
            "metrics_model_run_id": "demo-black-summer-v0",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["replay"]["event_id"] == "nsw-black-summer-south-coast"
    assert payload["incidents"]
    assert payload["hotspots"]
    assert len(payload["prediction"]["risk_cells"]) > 50
    assert {cell["horizon_hours"] for cell in payload["prediction"]["risk_cells"]} == {24, 48, 72}
    assert payload["metrics"]["metrics"]
    assert payload["heldout"]["model_run_id"] == "heldout-nsw-bushfire-v1"


def test_dashboard_frame_returns_only_replay_frame_payload():
    response = client.post(
        "/dashboard/frame",
        json={
            "bbox": [148.7, -37.4, 153.8, -31.1],
            "start_time": datetime(2020, 1, 6, tzinfo=UTC).isoformat(),
            "horizons": [24, 48, 72],
            "hotspot_start": datetime(2020, 1, 4, tzinfo=UTC).isoformat(),
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["prediction"]["risk_cells"]) > 50
    assert {cell["horizon_hours"] for cell in payload["prediction"]["risk_cells"]} == {24, 48, 72}
    assert payload["hotspots"]
    assert "metrics" not in payload
    assert "heldout" not in payload


def test_predict_rejects_invalid_bbox():
    response = client.post(
        "/predict",
        json={
            "bbox": [153.8, -37.4, 148.7, -31.1],
            "start_time": datetime(2020, 1, 5, tzinfo=UTC).isoformat(),
            "horizons": [24],
        },
    )

    assert response.status_code == 422


def test_predict_rejects_duplicate_or_excessive_horizons():
    body = {
        "bbox": [148.7, -37.4, 153.8, -31.1],
        "start_time": datetime(2020, 1, 5, tzinfo=UTC).isoformat(),
        "horizons": [24, 24],
    }

    duplicate_response = client.post("/predict", json=body)
    assert duplicate_response.status_code == 422

    excessive_response = client.post("/predict", json={**body, "horizons": [24, 48, 72, 24]})
    assert excessive_response.status_code == 422


def test_allocate_rejects_invalid_bbox():
    response = client.post(
        "/allocate",
        json={
            "bbox": [153.8, -37.4, 148.7, -31.1],
            "start_time": datetime(2020, 1, 5, tzinfo=UTC).isoformat(),
            "horizon_hours": 24,
            "crews": 1,
            "supplies": 0,
            "max_distance_km": 220,
        },
    )

    assert response.status_code == 422


def test_allocate_is_deterministic_for_same_inputs():
    body = {
        "bbox": [148.7, -37.4, 153.8, -31.1],
        "start_time": datetime(2020, 1, 5, tzinfo=UTC).isoformat(),
        "horizon_hours": 24,
        "crews": 3,
        "supplies": 2,
        "max_distance_km": 220,
    }

    first = client.post("/allocate", json=body).json()["allocations"]
    second = client.post("/allocate", json=body).json()["allocations"]

    assert first == second
    assert len(first) == 5


def test_reveal_compares_prediction_against_future_hotspots():
    response = client.post(
        "/reveal",
        json={
            "bbox": [148.7, -37.4, 153.8, -31.1],
            "start_time": datetime(2020, 1, 5, tzinfo=UTC).isoformat(),
            "horizon_hours": 72,
            "prediction_budget": 18,
            "spatial_tolerance_rings": 1,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    summary = payload["summary"]
    assert payload["reveal_run_id"].startswith("reveal-")
    assert summary["actual_hotspots"] > 0
    assert summary["predicted_cells"] == 18
    assert summary["hits"] + summary["misses"] == summary["actual_cells"]
    assert summary["spatial_tolerance_rings"] == 1
    assert summary["false_alarms"] <= summary["predicted_cells"]
    assert {cell["status"] for cell in payload["comparison_cells"]} <= {"hit", "miss", "false_alarm"}


def test_replay_event_contract():
    response = client.get("/replays/nsw-black-summer-south-coast")

    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "NSW Bushfire Replay"
    assert payload["region_bbox"] == [148.7, -37.4, 153.8, -31.1]


def test_heldout_metrics_contract():
    response = client.get("/metrics/heldout-nsw-bushfire-v1")

    assert response.status_code == 200
    payload = response.json()
    assert payload["model_run_id"] == "heldout-nsw-bushfire-v1"
    assert payload["dataset_name"].startswith("NSW DEA held-out")
    assert payload["evaluation_rows"] > 1000
    assert payload["positive_rate"] > 0
    pr_auc = next(metric for metric in payload["metrics"] if metric["name"] == "PR-AUC")
    assert pr_auc["model_value"] > pr_auc["baseline_value"]


def test_heldout_failure_analysis_contract():
    response = client.get("/heldout/failure-analysis")

    assert response.status_code == 200
    payload = response.json()
    assert payload["model_run_id"] == "heldout-nsw-bushfire-v1"
    assert payload["case_counts"]["hit"] > 0
    assert payload["case_counts"]["miss"] > 0
    assert payload["case_counts"]["false_alarm"] > 0
    assert payload["cases"]["hits"]
    assert payload["cases"]["missed"]
    assert payload["cases"]["false_alarms"]


def test_live_incident_parser_falls_back_on_malformed_feed_values():
    incidents = parse_nsw_rfs_incidents(
        {
            "features": [
                {
                    "properties": {"title": "Malformed", "size": "not-a-number"},
                    "geometry": {"coordinates": ["bad-lon", "bad-lat"]},
                }
            ]
        }
    )

    assert incidents[0].name == "Malformed"
    assert incidents[0].size_hectares == 0
    assert incidents[0].lat == -33.8688
    assert incidents[0].lon == 151.2093
