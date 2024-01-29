from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, brier_score_loss, precision_recall_curve


def build_metrics_payload(
    y_true: Any,
    model_probs: Any,
    baseline_probs: Any,
    *,
    model_run_id: str,
    generated_at: datetime | None = None,
    dataset_name: str | None = None,
    evaluation_window: dict[str, Any] | None = None,
) -> dict[str, Any]:
    labels = np.asarray(y_true, dtype=int)
    model_scores = np.asarray(model_probs, dtype=float)
    baseline_scores = np.asarray(baseline_probs, dtype=float)

    model_pr_auc = _average_precision(labels, model_scores)
    baseline_pr_auc = _average_precision(labels, baseline_scores)
    model_brier = brier_score_loss(labels, model_scores)
    baseline_brier = brier_score_loss(labels, baseline_scores)
    model_recall = recall_at_fraction(labels, model_scores, 0.10)
    baseline_recall = recall_at_fraction(labels, baseline_scores, 0.10)
    model_precision, model_recall_curve, _ = precision_recall_curve(labels, model_scores)

    top_decile = top_fraction_mask(model_scores, 0.10)
    confusion_summary = {
        "true_positive_top_decile": int(((labels == 1) & top_decile).sum()),
        "false_positive_top_decile": int(((labels == 0) & top_decile).sum()),
        "missed_future_hotspots": int(((labels == 1) & ~top_decile).sum()),
        "true_negative_cells": int(((labels == 0) & ~top_decile).sum()),
    }

    payload: dict[str, Any] = {
        "model_run_id": model_run_id,
        "generated_at": (generated_at or datetime.now(UTC)).isoformat(),
        "dataset_name": dataset_name,
        "evaluation_window": evaluation_window,
        "evaluation_rows": int(len(labels)),
        "positive_rate": round(float(labels.mean()), 4) if len(labels) else 0.0,
        "metrics": [
            {
                "name": "PR-AUC",
                "model_value": round(float(model_pr_auc), 4),
                "baseline_value": round(float(baseline_pr_auc), 4),
                "unit": "score",
                "interpretation": "Precision-recall performance on imbalanced future-hotspot labels.",
            },
            {
                "name": "Recall@Top-10%",
                "model_value": round(float(model_recall), 4),
                "baseline_value": round(float(baseline_recall), 4),
                "unit": "score",
                "interpretation": "Fraction of future hotspot cells caught in the highest-risk decile.",
            },
            {
                "name": "Brier Score",
                "model_value": round(float(model_brier), 4),
                "baseline_value": round(float(baseline_brier), 4),
                "unit": "loss",
                "interpretation": "Lower is better; measures probabilistic calibration.",
            },
            {
                "name": "PR Curve Points",
                "model_value": int(len(model_precision)),
                "baseline_value": int(len(model_recall_curve)),
                "unit": "points",
                "interpretation": "Number of threshold points available for deeper model review.",
            },
        ],
        "confusion_summary": confusion_summary,
        "calibration_bins": calibration_bins(labels, model_scores),
    }
    return payload


def top_fraction_mask(scores: Any, fraction: float):
    values = np.asarray(scores, dtype=float)
    if len(values) == 0:
        return np.array([], dtype=bool)
    threshold_rank = max(1, int(len(values) * fraction))
    order = values.argsort()[::-1]
    mask = np.zeros(len(values), dtype=bool)
    mask[order[:threshold_rank]] = True
    return mask


def recall_at_fraction(y_true: Any, scores: Any, fraction: float) -> float:
    labels = np.asarray(y_true, dtype=int)
    mask = top_fraction_mask(scores, fraction)
    positives = labels == 1
    if positives.sum() == 0:
        return 0.0
    return float((positives & mask).sum() / positives.sum())


def calibration_bins(y_true: Any, scores: Any) -> list[dict[str, float]]:
    frame = pd.DataFrame({"label": np.asarray(y_true, dtype=int), "score": np.asarray(scores, dtype=float)})
    frame["bin"] = pd.cut(frame["score"], bins=[0, 0.2, 0.4, 0.6, 0.8, 1.0], include_lowest=True)
    rows = []
    for _, group in frame.groupby("bin", observed=False):
        if group.empty:
            continue
        rows.append(
            {
                "bin": round(float(group["score"].mean()), 4),
                "predicted": round(float(group["score"].mean()), 4),
                "observed": round(float(group["label"].mean()), 4),
            }
        )
    return rows


def _average_precision(y_true: np.ndarray, scores: np.ndarray) -> float:
    if len(np.unique(y_true)) < 2:
        return 0.0
    return float(average_precision_score(y_true, scores))
