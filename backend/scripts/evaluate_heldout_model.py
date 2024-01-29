#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.ml.dataset import build_training_frame, read_hotspots_csv
from app.ml.evaluation import build_metrics_payload, top_fraction_mask
from app.ml.features import FEATURE_COLUMNS
from app.ml.model_registry import MODEL_PATH, get_trained_model
from app.services.geo import centroid_from_h3

MODEL_RUN_ID = "heldout-nsw-bushfire-v1"


def main() -> None:
    parser = argparse.ArgumentParser(description="Score the frozen bushfire model on an unseen DEA hotspot window.")
    parser.add_argument("--input", required=True, type=Path, help="Held-out normalized hotspot CSV")
    parser.add_argument("--output-dir", default=Path("backend/app/ml/artifacts"), type=Path)
    parser.add_argument(
        "--dataset-out",
        default=Path("backend/app/ml/artifacts/heldout_dataset.csv"),
        type=Path,
        help="Feature frame used for held-out scoring",
    )
    parser.add_argument(
        "--predictions-out",
        default=Path("backend/app/ml/artifacts/heldout_predictions.csv"),
        type=Path,
        help="Row-level held-out predictions and error labels",
    )
    parser.add_argument("--lookback-hours", default=36, type=int)
    parser.add_argument("--step-hours", default=12, type=int)
    parser.add_argument("--candidate-ring", default=3, type=int)
    parser.add_argument("--failure-limit", default=8, type=int)
    args = parser.parse_args()

    model = get_trained_model()
    if model is None:
        raise FileNotFoundError(f"Trained model artifact not found at {MODEL_PATH}")

    hotspots = read_hotspots_csv(args.input)
    dataset = build_training_frame(
        hotspots,
        lookback_hours=args.lookback_hours,
        step_hours=args.step_hours,
        candidate_ring=args.candidate_ring,
    ).sort_values(["prediction_time", "horizon_hours", "h3_id"])

    model_probs = np.asarray(model.predict_proba(dataset[FEATURE_COLUMNS].to_dict("records")), dtype=float)
    baseline_probs = dataset["baseline_score_raw"].clip(0, 1).to_numpy()

    window = {
        "dataset": "DEA Hotspots WFS NSW held-out event window",
        "source_rows": len(hotspots),
        "scored_rows": int(len(dataset)),
        "hotspot_start": min(hotspot.observed_at for hotspot in hotspots).isoformat(),
        "hotspot_end": max(hotspot.observed_at for hotspot in hotspots).isoformat(),
        "lookback_hours": args.lookback_hours,
        "step_hours": args.step_hours,
        "candidate_ring": args.candidate_ring,
        "trained_model_version": model.model_version,
        "trained_at": model.trained_at,
    }
    metrics = build_metrics_payload(
        dataset["label"].to_numpy(),
        model_probs,
        baseline_probs,
        model_run_id=MODEL_RUN_ID,
        dataset_name="NSW DEA held-out hotspots, Jan 10-16 2020",
        evaluation_window=window,
    )

    predictions = build_prediction_frame(dataset, model_probs, baseline_probs)
    failures = build_failure_payload(
        predictions,
        metrics=metrics,
        window=window,
        limit=args.failure_limit,
        generated_at=metrics["generated_at"],
    )

    args.output_dir.mkdir(parents=True, exist_ok=True)
    args.dataset_out.parent.mkdir(parents=True, exist_ok=True)
    args.predictions_out.parent.mkdir(parents=True, exist_ok=True)
    dataset.to_csv(args.dataset_out, index=False)
    predictions.to_csv(args.predictions_out, index=False)
    (args.output_dir / "heldout_metrics.json").write_text(json.dumps(metrics, indent=2))
    (args.output_dir / "heldout_failure_analysis.json").write_text(json.dumps(failures, indent=2))

    print(json.dumps(metrics, indent=2))


def build_prediction_frame(dataset: pd.DataFrame, model_probs: np.ndarray, baseline_probs: np.ndarray) -> pd.DataFrame:
    predictions = dataset[["prediction_time", "h3_id", "horizon_hours", "label", "baseline_score_raw"]].copy()
    predictions["model_score"] = model_probs
    predictions["baseline_score"] = baseline_probs
    predictions["top_decile"] = top_fraction_mask(model_probs, 0.10)
    predictions["error_type"] = np.select(
        [
            (predictions["label"] == 1) & predictions["top_decile"],
            (predictions["label"] == 1) & ~predictions["top_decile"],
            (predictions["label"] == 0) & predictions["top_decile"],
        ],
        ["hit", "miss", "false_alarm"],
        default="true_negative",
    )
    predictions["rank"] = predictions["model_score"].rank(method="first", ascending=False).astype(int)
    return predictions


def build_failure_payload(
    predictions: pd.DataFrame,
    *,
    metrics: dict[str, Any],
    window: dict[str, Any],
    limit: int,
    generated_at: str,
) -> dict[str, Any]:
    return {
        "model_run_id": MODEL_RUN_ID,
        "generated_at": generated_at or datetime.now(UTC).isoformat(),
        "metrics": metrics,
        "evaluation_window": window,
        "case_counts": predictions["error_type"].value_counts().to_dict(),
        "cases": {
            "missed": _case_records(
                predictions[predictions["error_type"] == "miss"].sort_values("model_score", ascending=True),
                limit,
            ),
            "false_alarms": _case_records(
                predictions[predictions["error_type"] == "false_alarm"].sort_values("model_score", ascending=False),
                limit,
            ),
            "hits": _case_records(
                predictions[predictions["error_type"] == "hit"].sort_values("model_score", ascending=False),
                limit,
            ),
        },
    }


def _case_records(frame: pd.DataFrame, limit: int) -> list[dict[str, Any]]:
    records = []
    for row in frame.head(limit).to_dict("records"):
        centroid = centroid_from_h3(row["h3_id"])
        records.append(
            {
                "h3_id": row["h3_id"],
                "prediction_time": row["prediction_time"],
                "horizon_hours": int(row["horizon_hours"]),
                "model_score": round(float(row["model_score"]), 4),
                "baseline_score": round(float(row["baseline_score"]), 4),
                "rank": int(row["rank"]),
                "centroid": centroid,
            }
        )
    return records


if __name__ == "__main__":
    main()
