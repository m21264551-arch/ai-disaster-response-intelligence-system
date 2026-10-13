#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
from sklearn.ensemble import HistGradientBoostingClassifier

from app.ml.dataset import build_training_frame, read_hotspots_csv
from app.ml.evaluation import build_metrics_payload
from app.ml.features import FEATURE_COLUMNS


def main() -> None:
    parser = argparse.ArgumentParser(description="Train and benchmark the bushfire H3 risk model.")
    parser.add_argument("--input", required=True, type=Path, help="Normalized hotspot CSV")
    parser.add_argument("--output-dir", default=Path("backend/app/ml/artifacts"), type=Path)
    parser.add_argument("--dataset-out", default=Path("backend/app/ml/artifacts/training_dataset.csv"), type=Path)
    parser.add_argument("--model-run-id", default="historical-nsw-bushfire-v1")
    parser.add_argument("--dataset-name", default="NSW South Coast DEA hotspots, Jan 4-10 2020")
    parser.add_argument("--lookback-hours", default=36, type=int)
    parser.add_argument("--step-hours", default=6, type=int)
    parser.add_argument("--candidate-ring", default=4, type=int)
    parser.add_argument(
        "--model-family",
        choices=("hist-gradient", "xgboost"),
        default="hist-gradient",
        help="Model family to train. XGBoost requires backend/requirements-optional.txt.",
    )
    args = parser.parse_args()

    hotspots = read_hotspots_csv(args.input)
    dataset = build_training_frame(
        hotspots,
        lookback_hours=args.lookback_hours,
        step_hours=args.step_hours,
        candidate_ring=args.candidate_ring,
    )
    dataset = dataset.sort_values("prediction_time").reset_index(drop=True)
    # Keep complete timestamp groups together and purge every 72-hour outcome window.
    import pandas as pd
    times = pd.to_datetime(dataset["prediction_time"], utc=True)
    cutoffs = sorted(times.unique())
    split_at = cutoffs[min(len(cutoffs)-1, int(len(cutoffs)*0.72))]
    train = dataset.loc[times + pd.Timedelta(hours=72) < split_at]
    test = dataset.loc[times >= split_at]
    if train.empty or test.empty or train["label"].nunique() < 2:
        raise ValueError("Insufficient covered history for a purged timestamp split; acquire a longer window")

    model, model_version = build_model(args.model_family, train["label"])
    model.fit(train[FEATURE_COLUMNS], train["label"])

    model_probs = model.predict_proba(test[FEATURE_COLUMNS])[:, 1]
    baseline_probs = test["baseline_score_raw"].clip(0, 1).to_numpy()
    metrics = build_metrics_payload(
        test["label"].to_numpy(),
        model_probs,
        baseline_probs,
        model_run_id=args.model_run_id,
        dataset_name=args.dataset_name,
        evaluation_window={
            "strategy": "temporal split",
            "training_rows": int(len(train)),
            "test_rows": int(len(test)),
            "first_test_prediction_time": str(test["prediction_time"].min()),
            "last_test_prediction_time": str(test["prediction_time"].max()),
            "lookback_hours": args.lookback_hours,
            "step_hours": args.step_hours,
            "candidate_ring": args.candidate_ring,
        },
    )

    args.output_dir.mkdir(parents=True, exist_ok=True)
    args.dataset_out.parent.mkdir(parents=True, exist_ok=True)
    dataset.to_csv(args.dataset_out, index=False)

    model_payload = {
        "model": model,
        "feature_columns": FEATURE_COLUMNS,
        "model_version": model_version,
        "model_family": args.model_family,
        "trained_at": datetime.now(UTC).isoformat(),
        "training_rows": int(len(train)),
        "test_rows": int(len(test)),
    }
    joblib.dump(model_payload, args.output_dir / "bushfire_risk_model.joblib")
    (args.output_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))
    (args.output_dir / "feature_schema.json").write_text(
        json.dumps({"feature_columns": FEATURE_COLUMNS, "label": "future hotspot in horizon"}, indent=2)
    )

    print(json.dumps(metrics, indent=2))


def build_model(model_family: str, labels: Any):
    if model_family == "hist-gradient":
        return (
            HistGradientBoostingClassifier(
                learning_rate=0.055,
                max_iter=220,
                max_leaf_nodes=31,
                l2_regularization=0.04,
                class_weight="balanced",
                random_state=42,
            ),
            "hist-gradient-bushfire-risk-v1",
        )

    if model_family == "xgboost":
        try:
            from xgboost import XGBClassifier
        except ImportError as exc:
            raise SystemExit(
                "XGBoost is not installed. Run `pip install -r backend/requirements-optional.txt` "
                "or use `--model-family hist-gradient`."
            ) from exc

        positives = int(labels.sum())
        negatives = int(len(labels) - positives)
        scale_pos_weight = negatives / positives if positives else 1.0
        return (
            XGBClassifier(
                n_estimators=320,
                max_depth=5,
                learning_rate=0.045,
                subsample=0.86,
                colsample_bytree=0.86,
                objective="binary:logistic",
                eval_metric="logloss",
                scale_pos_weight=scale_pos_weight,
                random_state=42,
                n_jobs=4,
            ),
            "xgboost-bushfire-risk-v1",
        )

    raise ValueError(f"Unsupported model family: {model_family}")


if __name__ == "__main__":
    main()
