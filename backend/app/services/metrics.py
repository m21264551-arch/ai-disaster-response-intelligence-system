from __future__ import annotations

from datetime import UTC, datetime

from app.ml.model_registry import load_heldout_failure_payload, load_metrics_payload
from app.schemas import HeldoutEvaluation, Metric, ModelMetrics


def demo_metrics(model_run_id: str) -> ModelMetrics:
    metrics_payload = load_metrics_payload(model_run_id)
    if metrics_payload:
        return ModelMetrics.model_validate(metrics_payload)

    return ModelMetrics(
        model_run_id=model_run_id,
        generated_at=datetime.now(UTC),
        metrics=[
            Metric(
                name="PR-AUC",
                model_value=0.742,
                baseline_value=0.431,
                unit="score",
                interpretation="Precision-recall performance on imbalanced future-hotspot labels.",
            ),
            Metric(
                name="Recall@Top-10%",
                model_value=0.816,
                baseline_value=0.524,
                unit="score",
                interpretation="Fraction of future hotspot cells caught in the highest-risk decile.",
            ),
            Metric(
                name="Brier Score",
                model_value=0.118,
                baseline_value=0.214,
                unit="loss",
                interpretation="Lower is better; measures probabilistic calibration.",
            ),
            Metric(
                name="Median Latency",
                model_value=183,
                baseline_value=41,
                unit="ms",
                interpretation="Prediction API latency for a replay-sized NSW bbox.",
            ),
        ],
        confusion_summary={
            "true_positive_top_decile": 111,
            "false_positive_top_decile": 36,
            "missed_future_hotspots": 25,
            "true_negative_cells": 843,
        },
        calibration_bins=[
            {"bin": 0.1, "predicted": 0.11, "observed": 0.08},
            {"bin": 0.3, "predicted": 0.31, "observed": 0.28},
            {"bin": 0.5, "predicted": 0.52, "observed": 0.49},
            {"bin": 0.7, "predicted": 0.71, "observed": 0.74},
            {"bin": 0.9, "predicted": 0.88, "observed": 0.84},
        ],
    )


def heldout_failure_analysis() -> HeldoutEvaluation:
    payload = load_heldout_failure_payload()
    if payload:
        return HeldoutEvaluation.model_validate(payload)

    fallback_metrics = demo_metrics("heldout-nsw-bushfire-v1")
    return HeldoutEvaluation(
        model_run_id="heldout-nsw-bushfire-v1",
        generated_at=datetime.now(UTC),
        metrics=fallback_metrics,
        evaluation_window={"dataset": "held-out artifact unavailable"},
        case_counts={"miss": 0, "false_alarm": 0, "hit": 0, "true_negative": 0},
        cases={"missed": [], "false_alarms": [], "hits": []},
    )
